import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * The palette, checked as numbers rather than as taste.
 *
 * Contrast is the one design property with a defined right answer, and it is the one nobody
 * notices going wrong: the app was shipped with secondary text at 2.2:1 on paper, which
 * looks restrained on a bright desktop monitor and is close to blank on a phone outdoors —
 * the scene it was actually built for. Nothing but arithmetic catches that.
 */
const CSS = readFileSync(join(process.cwd(), 'src/shared/assets/main.css'), 'utf8')

type Oklch = readonly [number, number, number]

/** Every token declaration in a block, keyed by name. */
function tokensIn(block: string): Map<string, Oklch> {
  const found = new Map<string, Oklch>()
  const pattern = /--color-([a-z-]+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/g

  for (const match of block.matchAll(pattern)) {
    const [, name, lightness, chroma, hue] = match

    if (!name) continue

    found.set(name, [Number(lightness) / 100, Number(chroma), Number(hue)])
  }

  return found
}

function blockAfter(marker: string): string {
  const start = CSS.indexOf(marker)

  if (start === -1) throw new Error(`No block found for ${marker}`)

  const open = CSS.indexOf('{', start)
  const close = CSS.indexOf('\n}', open)

  return CSS.slice(open, close)
}

const light = tokensIn(blockAfter('@theme'))
const systemDark = tokensIn(blockAfter(":root:not([data-theme='light'])"))
const chosenDark = tokensIn(blockAfter(":root[data-theme='dark']"))

/** Oklab to linear sRGB, which is what a luminance calculation actually needs. */
function linear([lightness, chroma, hue]: Oklch): [number, number, number] {
  const radians = (hue * Math.PI) / 180
  const a = chroma * Math.cos(radians)
  const b = chroma * Math.sin(radians)
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3

  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function luminance(colour: Oklch): number {
  const [red, green, blue] = linear(colour).map((value) => Math.min(Math.max(value, 0), 1))

  return 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0)
}

function contrast(palette: Map<string, Oklch>, foreground: string, background: string): number {
  const front = palette.get(foreground)
  const back = palette.get(background)

  if (!front || !back) throw new Error(`Missing token: ${foreground} or ${background}`)

  const [high, low] = [luminance(front), luminance(back)].sort((left, right) => right - left)

  return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05)
}

const SURFACES = ['canvas', 'surface', 'surface-sunken'] as const
const PALETTES = [
  ['light', light],
  ['dark', systemDark],
] as const

describe('text is readable on every surface it can land on', () => {
  for (const [name, palette] of PALETTES) {
    for (const surface of SURFACES) {
      for (const text of ['ink', 'ink-muted', 'ink-subtle'] as const) {
        it(`${name}: ${text} on ${surface} clears 4.5:1`, () => {
          // AA for normal text. These tones are used at 12–15px, so the large-text
          // exemption at 3:1 never applies to them.
          expect(contrast(palette, text, surface)).toBeGreaterThanOrEqual(4.5)
        })
      }
    }
  }
})

describe('a control has a visible boundary', () => {
  for (const [name, palette] of PALETTES) {
    for (const surface of SURFACES) {
      it(`${name}: line-strong on ${surface} clears 3:1`, () => {
        // WCAG 1.4.11. This border is the only thing saying an input is there, so failing it
        // removes the affordance rather than merely making it hard to read.
        expect(contrast(palette, 'line-strong', surface)).toBeGreaterThanOrEqual(3)
      })
    }
  }

  it('leaves the plain hairline soft, because a divider carries no information', () => {
    expect(contrast(light, 'line', 'surface')).toBeLessThan(3)
  })
})

describe('the two dark palettes stay in step', () => {
  it('declares the same tokens whether dark was chosen or inherited', () => {
    // CSS cannot share a block between a media query and a selector, so these are copies.
    // They have already drifted once, leaving a stored dark theme on the old failing values.
    expect(Object.fromEntries(chosenDark)).toEqual(Object.fromEntries(systemDark))
  })
})

describe('the tiers stay distinguishable', () => {
  it('keeps muted clearly darker than subtle in light', () => {
    // Passing the floor is not enough: collapsing the two into one value would make the
    // hierarchy vanish, which is a different way of failing the same reader.
    const muted = light.get('ink-muted')?.[0] ?? 0
    const subtle = light.get('ink-subtle')?.[0] ?? 0

    expect(subtle - muted).toBeGreaterThanOrEqual(0.05)
  })

  it('keeps muted clearly lighter than subtle in dark', () => {
    const muted = systemDark.get('ink-muted')?.[0] ?? 0
    const subtle = systemDark.get('ink-subtle')?.[0] ?? 0

    expect(muted - subtle).toBeGreaterThanOrEqual(0.05)
  })
})
