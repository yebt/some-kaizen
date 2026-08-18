/**
 * A colour the user picked, held as `#rrggbb`.
 *
 * Stored as hex rather than as a token name because it travels: a backup written today has
 * to still mean the same colour after the palette is redesigned.
 */
export type HexColour = string & { readonly __brand: unique symbol }

const HEX_PATTERN = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/** The two inks a coloured surface can carry. Near black and near white, matching the tokens. */
export const INK_ON_LIGHT = '#1c1c1a' as HexColour
export const INK_ON_DARK = '#fbfaf8' as HexColour

/** WCAG 2 minimum for body text, and the higher bar for small text. */
export const CONTRAST_AA = 4.5
export const CONTRAST_AA_LARGE = 3

export class InvalidColourError extends Error {
  constructor(readonly value: string) {
    super(`"${value}" is not a colour, expected a hex value such as #4f7d5b.`)
    this.name = 'InvalidColourError'
  }
}

/** Parses and normalises to lowercase six digit hex, so equality and storage stay stable. */
export function hexColour(value: string): HexColour {
  const match = HEX_PATTERN.exec(value.trim())

  if (!match) throw new InvalidColourError(value)

  const digits = (match[1] ?? '').toLowerCase()
  const expanded =
    digits.length === 3 ? [...digits].map((digit) => `${digit}${digit}`).join('') : digits

  return `#${expanded}` as HexColour
}

export function channels(colour: HexColour): [number, number, number] {
  return [
    Number.parseInt(colour.slice(1, 3), 16),
    Number.parseInt(colour.slice(3, 5), 16),
    Number.parseInt(colour.slice(5, 7), 16),
  ]
}

/**
 * Relative luminance as WCAG 2 defines it.
 *
 * Each channel is linearised before weighting, because sRGB is gamma encoded: averaging the
 * raw bytes would call mid grey twice as bright as it looks. The weights are unequal
 * because the eye is far more sensitive to green than to blue.
 */
export function relativeLuminance(colour: HexColour): number {
  const [red, green, blue] = channels(colour).map((channel) => {
    const proportion = channel / 255

    return proportion <= 0.03928 ? proportion / 12.92 : Math.pow((proportion + 0.055) / 1.055, 2.4)
  }) as [number, number, number]

  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

/** Contrast between two colours, from 1 for identical to 21 for black against white. */
export function contrastRatio(colour: HexColour, other: HexColour): number {
  const first = relativeLuminance(colour)
  const second = relativeLuminance(other)
  const lighter = Math.max(first, second)
  const darker = Math.min(first, second)

  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * The ink that reads best on a given background.
 *
 * Computed rather than chosen, because a person picking a colour is not thinking about
 * whether the label on it will still be readable, and a fixed white label turns unreadable
 * the moment someone picks a pale yellow. Comparing both candidates and keeping the higher
 * contrast is one line of arithmetic that removes the whole class of problem.
 */
export function readableInkOn(background: HexColour): HexColour {
  return contrastRatio(background, INK_ON_LIGHT) >= contrastRatio(background, INK_ON_DARK)
    ? INK_ON_LIGHT
    : INK_ON_DARK
}

/** Whether the pairing clears a WCAG threshold, so a palette can be checked rather than trusted. */
export function meetsContrast(
  colour: HexColour,
  other: HexColour,
  minimum: number = CONTRAST_AA,
): boolean {
  return contrastRatio(colour, other) >= minimum
}
