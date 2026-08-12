import { describe, expect, it } from 'vitest'

import { InvalidPatternError, PALETTE, PATTERNS, patternName } from './appearance'
import { contrastRatio, CONTRAST_AA_LARGE, readableInkOn } from './colour'

describe('patternName', () => {
  it.each(PATTERNS)('accepts the pattern %s', (value) => {
    expect(patternName(value)).toBe(value)
  })

  it.each(['', 'plaid', 'STRIPES'])('rejects the unknown pattern %s', (value) => {
    expect(() => patternName(value)).toThrow(InvalidPatternError)
  })
})

describe('the palette', () => {
  it('offers a usable number of choices', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(6)
  })

  it('holds no duplicates, so two habits cannot look identical by accident', () => {
    expect(new Set(PALETTE).size).toBe(PALETTE.length)
  })

  it('gives every colour a readable label', () => {
    // This is the promise a fixed palette exists to make. If a colour is ever added that
    // breaks it, this fails here rather than on someone's screen.
    for (const colour of PALETTE) {
      expect(contrastRatio(colour, readableInkOn(colour))).toBeGreaterThanOrEqual(CONTRAST_AA_LARGE)
    }
  })

  it('keeps every colour distinguishable from its neighbours in the list', () => {
    for (let index = 1; index < PALETTE.length; index += 1) {
      const previous = PALETTE[index - 1]
      const current = PALETTE[index]

      if (!previous || !current) continue

      expect(contrastRatio(previous, current)).not.toBeCloseTo(1, 1)
    }
  })
})
