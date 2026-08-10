import { describe, expect, it } from 'vitest'

import { identifier, InvalidIdentifierError, newIdentifier } from './identifier'

describe('newIdentifier', () => {
  it('produces a value its own parser accepts', () => {
    expect(() => identifier(newIdentifier())).not.toThrow()
  })

  it('does not repeat across a large batch', () => {
    const generated = Array.from({ length: 1000 }, () => newIdentifier())

    expect(new Set(generated).size).toBe(1000)
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
