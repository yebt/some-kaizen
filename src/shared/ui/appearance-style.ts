import type { Appearance, PatternName } from '@shared/domain/appearance'
import { type HexColour, readableInkOn } from '@shared/domain/colour'

/** Faint enough to texture the surface without competing with the label sitting on it. */
const PATTERN_ALPHA = '2e'
const PATTERN_SIZE = '10px 10px'

function patternImage(pattern: PatternName, ink: string): string | undefined {
  switch (pattern) {
    case 'solid':
      return undefined
    case 'stripes':
      return `repeating-linear-gradient(90deg, ${ink} 0 2px, transparent 2px 10px)`
    case 'diagonal':
      return `repeating-linear-gradient(45deg, ${ink} 0 2px, transparent 2px 10px)`
    case 'dots':
      return `radial-gradient(${ink} 1.5px, transparent 1.6px)`
    case 'grid':
      return (
        `repeating-linear-gradient(0deg, ${ink} 0 1px, transparent 1px 10px),` +
        `repeating-linear-gradient(90deg, ${ink} 0 1px, transparent 1px 10px)`
      )
  }
}

/**
 * The inline style for a coloured surface, including the ink that will read on it.
 *
 * The foreground is computed from the background rather than fixed, so a pale yellow gets
 * dark text and a deep blue gets light text without anyone having to remember. The pattern
 * is drawn in that same ink at low opacity, which keeps it visible on either extreme
 * instead of vanishing into a dark colour the way a fixed white texture would.
 *
 * A habit with no colour returns nothing at all, so it keeps the ordinary card styling
 * rather than being forced into a default colour it never asked for.
 */
export function surfaceStyle(appearance: Appearance): Record<string, string> {
  if (!appearance.colour) return {}

  const background: HexColour = appearance.colour
  const ink = readableInkOn(background)
  const image = appearance.pattern
    ? patternImage(appearance.pattern, `${ink}${PATTERN_ALPHA}`)
    : undefined

  return {
    backgroundColor: background,
    color: ink,
    ...(image ? { backgroundImage: image, backgroundSize: PATTERN_SIZE } : {}),
  }
}

/** A small round preview of a colour and pattern, for lists and pickers. */
export function swatchStyle(appearance: Appearance): Record<string, string> {
  return surfaceStyle(appearance)
}
