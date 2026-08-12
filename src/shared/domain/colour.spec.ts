import { describe, expect, it } from 'vitest'

import {
  channels,
  CONTRAST_AA,
  contrastRatio,
  hexColour,
  INK_ON_DARK,
  INK_ON_LIGHT,
  InvalidColourError,
  meetsContrast,
  readableInkOn,
  relativeLuminance,
} from './colour'

const WHITE = hexColour('#ffffff')
const BLACK = hexColour('#000000')

describe('hexColour', () => {
  it('accepts six digit hex', () => {
    expect(hexColour('#4F7D5B')).toBe('#4f7d5b')
  })

  it('expands the three digit shorthand', () => {
    expect(hexColour('#abc')).toBe('#aabbcc')
  })

  it('accepts a value with no leading hash', () => {
    expect(hexColour('4f7d5b')).toBe('#4f7d5b')
  })

  it('trims surrounding space, as a pasted value carries', () => {
    expect(hexColour('  #4f7d5b  ')).toBe('#4f7d5b')
  })

  it.each(['', '#12345', 'rebeccapurple', '#gggggg', '#1234567'])(
    'rejects the malformed value %s',
    (value) => {
      expect(() => hexColour(value)).toThrow(InvalidColourError)
    },
  )
})

describe('channels', () => {
  it('splits the value into red, green and blue', () => {
    expect(channels(hexColour('#4f7d5b'))).toEqual([79, 125, 91])
  })
})

describe('relativeLuminance', () => {
  it('is one for white and zero for black', () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5)
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5)
  })

  it('weights green far above blue, as the eye does', () => {
    const green = relativeLuminance(hexColour('#00ff00'))
    const blue = relativeLuminance(hexColour('#0000ff'))

    expect(green).toBeGreaterThan(blue * 5)
  })

  it('linearises the channel rather than averaging the raw byte', () => {
    // Mid grey looks about half as bright as white but is nowhere near half its luminance.
    expect(relativeLuminance(hexColour('#808080'))).toBeLessThan(0.3)
  })
})

describe('contrastRatio', () => {
  it('is 21 for black against white, the maximum', () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1)
  })

  it('is 1 for a colour against itself', () => {
    expect(contrastRatio(WHITE, WHITE)).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    const colour = hexColour('#4f7d5b')

    expect(contrastRatio(colour, WHITE)).toBeCloseTo(contrastRatio(WHITE, colour), 10)
  })

  it('matches the known WCAG boundary grey', () => {
    // #767676 is the classic darkest grey that still clears 4.5:1 on white.
    expect(contrastRatio(hexColour('#767676'), WHITE)).toBeCloseTo(4.54, 1)
  })
})

describe('readableInkOn', () => {
  it('puts dark ink on a pale background', () => {
    expect(readableInkOn(hexColour('#ffe9a8'))).toBe(INK_ON_LIGHT)
  })

  it('puts light ink on a deep background', () => {
    expect(readableInkOn(hexColour('#1f3a5f'))).toBe(INK_ON_DARK)
  })

  it('does not trust the hue: a saturated yellow is a light background', () => {
    // A fixed white label is exactly what turns unreadable here.
    expect(readableInkOn(hexColour('#ffff00'))).toBe(INK_ON_LIGHT)
  })

  it('treats a saturated blue as a dark background despite being vivid', () => {
    expect(readableInkOn(hexColour('#0000ff'))).toBe(INK_ON_DARK)
  })

  it('always returns the higher contrast of the two candidates', () => {
    const samples = ['#ffffff', '#000000', '#808080', '#4f7d5b', '#ffe9a8', '#1f3a5f', '#c0392b']

    for (const sample of samples) {
      const background = hexColour(sample)
      const chosen = readableInkOn(background)
      const other = chosen === INK_ON_LIGHT ? INK_ON_DARK : INK_ON_LIGHT

      expect(contrastRatio(background, chosen)).toBeGreaterThanOrEqual(
        contrastRatio(background, other),
      )
    }
  })

  it('clears the readable threshold on mid grey, the hardest case there is', () => {
    // Mid grey is the worst possible background: it is equidistant from both inks.
    const background = hexColour('#808080')

    expect(contrastRatio(background, readableInkOn(background))).toBeGreaterThanOrEqual(3)
  })
})

describe('meetsContrast', () => {
  it('accepts a pairing that clears the threshold', () => {
    expect(meetsContrast(BLACK, WHITE)).toBe(true)
  })

  it('rejects a pairing that does not', () => {
    expect(meetsContrast(hexColour('#cccccc'), WHITE, CONTRAST_AA)).toBe(false)
  })

  it('can be asked about the lower bar for large text', () => {
    expect(meetsContrast(hexColour('#949494'), WHITE, 3)).toBe(true)
  })
})
