import { describe, expect, it } from 'vitest'

import { derivedIdentifier, identifier, InvalidIdentifierError, newIdentifier } from './identifier'

describe('newIdentifier', () => {
  it('produces a value its own parser accepts', () => {
    expect(() => identifier(newIdentifier())).not.toThrow()
  })

  it('does not repeat across a large batch', () => {
    const generated = Array.from({ length: 1000 }, () => newIdentifier())

    expect(new Set(generated).size).toBe(1000)
  })

  it('marks the value as a version 4 UUID with the RFC variant bits', () => {
    expect(newIdentifier()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('works in an insecure context, where crypto.randomUUID does not exist', () => {
    // Opening the app over a plain LAN address to test on a handset is not a secure
    // context, so randomUUID is undefined there. Relying on it broke every screen that
    // creates a record; this pins the fix.
    const original = Reflect.get(crypto, 'randomUUID')

    Reflect.deleteProperty(crypto, 'randomUUID')

    try {
      expect(() => identifier(newIdentifier())).not.toThrow()
    } finally {
      if (original) Reflect.set(crypto, 'randomUUID', original)
    }
  })
})

describe('identifier', () => {
  it('accepts a canonical lowercase UUID', () => {
    expect(identifier('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    )
  })

  it('normalises an uppercase UUID to lowercase so equality stays reliable', () => {
    expect(identifier('3F2504E0-4F89-41D3-9A0C-0305E82C3301')).toBe(
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    )
  })

  it.each([
    '',
    'not-a-uuid',
    '3f2504e0-4f89-41d3-9a0c',
    '3f2504e04f8941d39a0c0305e82c3301',
    '3f2504e0-4f89-41d3-9a0c-0305e82c3301-extra',
  ])('rejects the malformed value %s', (value) => {
    expect(() => identifier(value)).toThrow(InvalidIdentifierError)
  })
})

describe('derivedIdentifier', () => {
  it('produces a value its own parser accepts', () => {
    expect(() =>
      identifier(derivedIdentifier('occurrence', 'habit', '2026-03-11', '0')),
    ).not.toThrow()
  })

  it('gives the same parts the same identifier, which is the entire point', () => {
    // Two devices that have never spoken must land on the same record for the same event.
    expect(derivedIdentifier('occurrence', 'habit', '2026-03-11', '0')).toBe(
      derivedIdentifier('occurrence', 'habit', '2026-03-11', '0'),
    )
  })

  it('separates different slots on the same day', () => {
    expect(derivedIdentifier('occurrence', 'habit', '2026-03-11', '0')).not.toBe(
      derivedIdentifier('occurrence', 'habit', '2026-03-11', '1'),
    )
  })

  it('separates different days', () => {
    expect(derivedIdentifier('occurrence', 'habit', '2026-03-11', '0')).not.toBe(
      derivedIdentifier('occurrence', 'habit', '2026-03-12', '0'),
    )
  })

  it('separates different habits', () => {
    expect(derivedIdentifier('occurrence', 'a', '2026-03-11', '0')).not.toBe(
      derivedIdentifier('occurrence', 'b', '2026-03-11', '0'),
    )
  })

  it('cannot be confused by parts running together', () => {
    // Without a separator ('ab', 'c') and ('a', 'bc') would collide.
    expect(derivedIdentifier('ab', 'c')).not.toBe(derivedIdentifier('a', 'bc'))
  })

  it('differs from a random identifier for the same conceptual thing', () => {
    expect(derivedIdentifier('occurrence', 'habit', '2026-03-11', '0')).not.toBe(newIdentifier())
  })
})
