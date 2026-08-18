import { describe, expect, it } from 'vitest'

import { SYMBOLS } from '@shared/domain/appearance'

import { ICONS, SYMBOL_ICONS } from './icons'

describe('the symbol drawings', () => {
  it('has one for every symbol the domain offers', () => {
    // A symbol with no drawing is a habit whose mark is an empty circle, and nothing in the
    // type system notices: `satisfies Record<SymbolName, …>` catches a missing key at build
    // time, and this catches the same thing for anyone reading the suite rather than tsc.
    for (const name of SYMBOLS) expect(SYMBOL_ICONS[name]).toBeDefined()
  })

  it('draws no symbol with the app’s own furniture', () => {
    // Kept apart on purpose: `ICONS` are chevrons and gears the app owns, and a symbol is
    // somebody's choice about their own habit. Sharing a drawing between the two would let a
    // redraw of the settings gear silently change what a habit looks like.
    const furniture = new Set(Object.values(ICONS))
    const shared = SYMBOLS.filter((name) => furniture.has(SYMBOL_ICONS[name]))

    expect(shared).toEqual([])
  })
})
