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

/**
 * The symbols a habit can wear.
 *
 * A drawn set at one stroke weight, not emoji. An emoji is a different typeface on every
 * platform — the same character is a flat glyph on one phone and a glossy cartoon on
 * another, so a list styled on one device is a different list on the next. Several of them
 * also carry a skin tone and a gender nobody chose, which is a statement to put beside
 * "Meditate" without being asked.
 *
 * Deliberately a small set. A picker of four hundred icons is a decision nobody wants to
 * make and most people abandon; these are the shapes habits actually take, and the point of
 * an icon here is recognising a row at a glance rather than expressing anything.
 */
export const SYMBOLS = [
  'run',
  'walk',
  'strength',
  'stretch',
  'water',
  'food',
  'sleep',
  'read',
  'write',
  'learn',
  'breathe',
  'music',
  'money',
  'home',
  'people',
  'screen',
] as const

export type SymbolName = (typeof SYMBOLS)[number]

export class InvalidSymbolError extends Error {
  constructor(readonly value: string) {
    super(`"${value}" is not a symbol, expected one of ${SYMBOLS.join(', ')}.`)
    this.name = 'InvalidSymbolError'
  }
}

export function symbolName(value: string): SymbolName {
  if (!SYMBOLS.includes(value as SymbolName)) throw new InvalidSymbolError(value)

  return value as SymbolName
}

/**
 * How a habit or a block is drawn. Every part is optional; none is required.
 *
 * Colour and pattern stay exactly as they were. Pattern is what survives greyscale and
 * colour blindness, and a symbol does not replace it: a symbol says *which* habit, a pattern
 * says *this one is different from that one* even when the colours have collapsed into the
 * same grey.
 */
export interface Appearance {
  readonly colour?: HexColour
  readonly pattern?: PatternName
  readonly symbol?: SymbolName
}
