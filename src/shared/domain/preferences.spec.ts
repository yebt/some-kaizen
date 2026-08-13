import { describe, expect, it } from 'vitest'

import {
  DEFAULT_PREFERENCES,
  readPreferences,
  TIMELINE_SCALES,
  timelineScale,
  usesHour12,
  zoomedTimeline,
} from './preferences'

describe('readPreferences', () => {
  it('reads stored choices back', () => {
    expect(readPreferences({ clock: '12h', theme: 'dark', timeline: 'fine' })).toEqual({
      ...DEFAULT_PREFERENCES,
      clock: '12h',
      theme: 'dark',
      timeline: 'fine',
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
    expect(readPreferences({ clock: 'sundial', theme: 'dark', timeline: 'fine' })).toEqual({
      ...DEFAULT_PREFERENCES,
      theme: 'dark',
      timeline: 'fine',
    })
  })

  it('ignores unknown extra fields, so an older build reading a newer file still works', () => {
    expect(readPreferences({ clock: '12h', theme: 'light', future: true })).toEqual({
      ...DEFAULT_PREFERENCES,
      clock: '12h',
      theme: 'light',
    })
  })

  it('fills in a timeline detail an older stored value never had', () => {
    expect(readPreferences({ clock: '24h', theme: 'dark' }).timeline).toBe('normal')
  })

  it('fills in the newer display choices the same way', () => {
    const restored = readPreferences({ clock: '24h', theme: 'dark' })

    expect(restored.done).toBe(DEFAULT_PREFERENCES.done)
    expect(restored.allowRedo).toBe(false)
  })

  it('refuses a redo flag that is not a boolean', () => {
    expect(readPreferences({ allowRedo: 'yes' }).allowRedo).toBe(false)
  })

  it('folds a habit already done out of the way by default', () => {
    // The top of the list should be the work left, not a record of the work finished.
    expect(DEFAULT_PREFERENCES.done).toBe('compact')
  })
})

describe('the timeline scale', () => {
  it('is the middle setting by default, so the app opens on the ruler it was built around', () => {
    expect(timelineScale(DEFAULT_PREFERENCES)).toEqual(TIMELINE_SCALES.normal)
  })

  it('keeps a taller day and a finer step together', () => {
    // The two cannot be separated: a five minute step on a short ruler is unhittable.
    expect(TIMELINE_SCALES.fine.pixelsPerMinute).toBeGreaterThan(
      TIMELINE_SCALES.normal.pixelsPerMinute,
    )
    expect(TIMELINE_SCALES.fine.snapMinutes).toBeLessThan(TIMELINE_SCALES.normal.snapMinutes)
  })

  it('never draws a step smaller than four pixels, which is smaller than a fingertip', () => {
    for (const scale of Object.values(TIMELINE_SCALES)) {
      expect(scale.snapMinutes * scale.pixelsPerMinute).toBeGreaterThanOrEqual(10)
    }
  })
})

describe('zooming', () => {
  const at = (timeline: 'coarse' | 'normal' | 'fine') => ({ ...DEFAULT_PREFERENCES, timeline })

  it('steps towards more detail', () => {
    expect(zoomedTimeline(at('normal'), 1)).toBe('fine')
  })

  it('steps towards a wider view', () => {
    expect(zoomedTimeline(at('normal'), -1)).toBe('coarse')
  })

  it('stops at the closest view rather than wrapping around to the widest', () => {
    // Wrapping reads as the control having broken, not as having run out of room.
    expect(zoomedTimeline(at('fine'), 1)).toBe('fine')
  })

  it('stops at the widest view too', () => {
    expect(zoomedTimeline(at('coarse'), -1)).toBe('coarse')
  })
})

describe('usesHour12', () => {
  it('is true only for the twelve hour clock', () => {
    expect(usesHour12({ ...DEFAULT_PREFERENCES, clock: '12h' })).toBe(true)
    expect(usesHour12({ ...DEFAULT_PREFERENCES, clock: '24h' })).toBe(false)
  })
})
