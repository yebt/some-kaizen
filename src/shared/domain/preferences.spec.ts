import { describe, expect, it } from 'vitest'

import { DEFAULT_PREFERENCES, readPreferences, usesHour12 } from './preferences'

describe('readPreferences', () => {
  it('reads a stored pair back', () => {
    expect(readPreferences({ clock: '12h', theme: 'dark' })).toEqual({
      clock: '12h',
      theme: 'dark',
    })
  })

  it('defaults to the system theme, so a phone switching at sunset takes the app with it', () => {
    expect(DEFAULT_PREFERENCES.theme).toBe('system')
  })

  it.each([null, undefined, 'nonsense', 42, []])(
    'falls back to the defaults for the stored value %s',
    (raw) => {
      // A corrupted preference should never stop the app from starting: losing a theme
      // choice costs nothing, unlike losing a year of habits.
      expect(readPreferences(raw)).toEqual(DEFAULT_PREFERENCES)
    },
  )

  it('replaces only the field it cannot understand', () => {
    expect(readPreferences({ clock: 'sundial', theme: 'dark' })).toEqual({
      clock: DEFAULT_PREFERENCES.clock,
      theme: 'dark',
    })
  })

  it('ignores unknown extra fields, so an older build reading a newer file still works', () => {
    expect(readPreferences({ clock: '12h', theme: 'light', future: true })).toEqual({
      clock: '12h',
      theme: 'light',
    })
  })
})

describe('usesHour12', () => {
  it('is true only for the twelve hour clock', () => {
    expect(usesHour12({ clock: '12h', theme: 'system' })).toBe(true)
    expect(usesHour12({ clock: '24h', theme: 'system' })).toBe(false)
  })
})
