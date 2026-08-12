import { hexColour, type HexColour } from './colour'

/**
 * A texture drawn over a colour.
 *
 * Patterns exist for legibility, not decoration. Around one man in twelve cannot reliably
 * tell red from green, and any colour at all disappears in greyscale or under a bright
 * screen outdoors. A habit carrying both a colour and a texture stays distinguishable when
 * the colour alone does not.
 */
export const PATTERNS = ['solid', 'stripes', 'dots', 'grid', 'diagonal'] as const

export type PatternName = (typeof PATTERNS)[number]

/**
 * The colours offered for habits and blocks.
 *
 * A fixed palette rather than a free picker: every entry here is checked against both inks
 * so whichever one is chosen, the label on it stays readable. A free picker would let
 * someone land on a colour that reads perfectly in the picker and terribly on the card.
 */
export const PALETTE: readonly HexColour[] = [
  hexColour('#4f7d5b'),
  hexColour('#2f6f8f'),
  hexColour('#3f4d8a'),
  hexColour('#7a4f8a'),
  hexColour('#a8453a'),
  hexColour('#b8763a'),
  hexColour('#c9a227'),
  hexColour('#5c5c56'),
]

export class InvalidPatternError extends Error {
  constructor(readonly value: string) {
    super(`"${value}" is not a pattern, expected one of ${PATTERNS.join(', ')}.`)
    this.name = 'InvalidPatternError'
  }
}

export function patternName(value: string): PatternName {
  if (!PATTERNS.includes(value as PatternName)) throw new InvalidPatternError(value)

  return value as PatternName
}

/** How a habit or a block is drawn. Both parts are optional; neither one is required. */
export interface Appearance {
  readonly colour?: HexColour
  readonly pattern?: PatternName
}
