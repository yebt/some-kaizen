import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { MINUTES_PER_DAY } from '@shared/domain/time-of-day'

import { presetMinutes, ROUTINE_PRESETS } from './preset-library'
import { importPreset } from './routine-preset'

/**
 * The bundled library is data, and data that ships is code that has not been run.
 *
 * Everything here is a guard on content rather than on logic. A preset with a duplicate step,
 * a zero length or an empty name would not fail a type check and would not fail any test of
 * `importPreset` — it would throw in front of a real person, on the one screen that exists so
 * a beginner does not face a blank form.
 */
const TODAY = calendarDate('2026-03-11')

describe('every bundled preset', () => {
  it.each(ROUTINE_PRESETS.map((preset) => [preset.name, preset] as const))(
    '%s imports without the domain refusing it',
    (_name, preset) => {
      expect(() =>
        importPreset(
          preset,
          { habits: [], routines: [] },
          { routineId: newIdentifier(), newHabitId: newIdentifier, today: TODAY },
        ),
      ).not.toThrow()
    },
  )

  it.each(ROUTINE_PRESETS.map((preset) => [preset.name, preset] as const))(
    '%s has steps, each with a name and a real length',
    (_name, preset) => {
      expect(preset.steps.length).toBeGreaterThan(0)

      for (const step of preset.steps) {
        expect(step.name.trim()).not.toBe('')
        expect(Number.isInteger(step.durationMinutes)).toBe(true)
        expect(step.durationMinutes).toBeGreaterThan(0)
      }
    },
  )

  it.each(ROUTINE_PRESETS.map((preset) => [preset.name, preset] as const))(
    '%s names each step once, since a routine refuses a repeat',
    (_name, preset) => {
      const names = preset.steps.map((step) => step.name.trim().toLowerCase())

      expect(new Set(names).size).toBe(names.length)
    },
  )

  it.each(ROUTINE_PRESETS.map((preset) => [preset.name, preset] as const))(
    '%s fits inside a day, so it can be built without spilling over',
    (_name, preset) => {
      // A preset longer than a day could never be placed in full, which would make the
      // screen offer something the builder then refuses.
      expect(presetMinutes(preset)).toBeLessThan(MINUTES_PER_DAY)
    },
  )

  it.each(ROUTINE_PRESETS.map((preset) => [preset.name, preset] as const))(
    '%s says what it is for, which is what someone chooses between',
    (_name, preset) => {
      expect(preset.summary.trim()).not.toBe('')
      expect(preset.name.trim()).not.toBe('')
    },
  )
})

describe('the library as a whole', () => {
  it('addresses each preset by a key that cannot collide', () => {
    // The key is what a screen holds on to. Two presets sharing one would make a list where
    // choosing the second gives you the first.
    const keys = ROUTINE_PRESETS.map((preset) => preset.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('offers names that can be told apart in a list', () => {
    const names = ROUTINE_PRESETS.map((preset) => preset.name.toLowerCase())

    expect(new Set(names).size).toBe(names.length)
  })

  it('is short enough to read in one sitting', () => {
    // A library nobody finishes reading is a menu, and a menu is where the blank page comes
    // back. Kept deliberately small; this fails if it quietly grows into a catalogue.
    expect(ROUTINE_PRESETS.length).toBeLessThanOrEqual(8)
    expect(ROUTINE_PRESETS.length).toBeGreaterThan(0)
  })

  it('reports the total length someone judges a preset by', () => {
    const [first] = ROUTINE_PRESETS

    expect(presetMinutes(first!)).toBe(
      first!.steps.reduce((sum, step) => sum + step.durationMinutes, 0),
    )
  })
})
