import { describe, expect, it } from 'vitest'

import { isShowing, scrollToCentre } from './ribbon-geometry'

/** A 300 wide scroller sitting 20 from the left of the screen. */
const container = { left: 20, width: 300, scrollLeft: 0 }

describe('whether a cell is showing', () => {
  it('says yes for one sitting inside', () => {
    expect(isShowing(container, { left: 100, width: 44 })).toBe(true)
  })

  it('says yes for one only half in, since half a cell is still visible', () => {
    expect(isShowing(container, { left: 300, width: 44 })).toBe(true)
  })

  it('says no for one entirely past the right edge', () => {
    expect(isShowing(container, { left: 321, width: 44 })).toBe(false)
  })

  it('says no for one entirely off the left', () => {
    expect(isShowing(container, { left: -30, width: 44 })).toBe(false)
  })

  it('says yes for one clipped by the left edge but still partly there', () => {
    expect(isShowing(container, { left: 0, width: 44 })).toBe(true)
  })

  it('is measured against the container, not the page', () => {
    // The bug this replaced compared a distance from some positioned ancestor against a
    // scroll offset — two numbers with different origins, which happened to line up in one
    // engine and not in another.
    const shifted = { left: 500, width: 300, scrollLeft: 0 }

    expect(isShowing(shifted, { left: 520, width: 44 })).toBe(true)
    expect(isShowing(shifted, { left: 100, width: 44 })).toBe(false)
  })
})

describe('scrolling a cell to the middle', () => {
  it('centres one that is to the right', () => {
    // Cell 100 into the container, 44 wide, in a 300 wide window: 100 - (300-44)/2 = -28,
    // clamped to the start.
    expect(scrollToCentre(container, { left: 320, width: 44 })).toBe(300 - (300 - 44) / 2)
  })

  it('accounts for how far the ribbon is already scrolled', () => {
    const scrolled = { ...container, scrollLeft: 1000 }

    expect(scrollToCentre(scrolled, { left: 20, width: 44 })).toBe(1000 - (300 - 44) / 2)
  })

  it('never asks for a negative position', () => {
    expect(scrollToCentre(container, { left: 20, width: 44 })).toBe(0)
  })

  it('gives the same answer twice, so repeating it does not creep', () => {
    // Absolute rather than a delta: a caller that centres on every selection change would
    // otherwise walk the ribbon a little further each time.
    const centred = { left: 20 + (300 - 44) / 2, width: 44 }
    const first = scrollToCentre(container, centred)
    const second = scrollToCentre({ ...container, scrollLeft: first }, centred)

    expect(second).toBe(first)
  })
})

describe('what a remembered position has to satisfy', () => {
  it('is kept when the chosen day is still on screen', () => {
    // The point of remembering: arriving back on a screen you were already looking at should
    // not move anything.
    expect(isShowing(container, { left: 120, width: 44 })).toBe(true)
  })

  it('is abandoned when it would open four months from the chosen day', () => {
    // A greeting that lands somewhere unrelated is worse than the jolt it saves.
    expect(isShowing(container, { left: 5834, width: 44 })).toBe(false)
  })
})
