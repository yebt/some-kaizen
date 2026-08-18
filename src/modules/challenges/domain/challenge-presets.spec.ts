import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'

import { MAX_CHALLENGE_LENGTH_DAYS, MAX_CHALLENGE_TASKS } from './challenge'
import { CHALLENGE_PRESETS, challengeFromPreset } from './challenge-presets'

const STARTED_ON = calendarDate('2026-03-01')

function mint() {
  return { id: newIdentifier(), newTaskId: newIdentifier, startedOn: STARTED_ON }
}

const EVERY = CHALLENGE_PRESETS.map((preset) => [preset.name, preset] as const)

describe('every bundled programme', () => {
  it.each(EVERY)('%s becomes a challenge the model accepts', (_name, preset) => {
    // Data that ships is code that has not been run: a preset asking for thirteen things a
    // day would throw in front of whoever chose it.
    expect(() => challengeFromPreset(preset, mint())).not.toThrow()
  })

  it.each(EVERY)('%s stays inside what the model allows', (_name, preset) => {
    expect(preset.tasks.length).toBeGreaterThan(0)
    expect(preset.tasks.length).toBeLessThanOrEqual(MAX_CHALLENGE_TASKS)
    expect(preset.lengthDays).toBeGreaterThan(0)
    expect(preset.lengthDays).toBeLessThanOrEqual(MAX_CHALLENGE_LENGTH_DAYS)
  })

  it.each(EVERY)('%s says what it asks, which is what somebody decides against', (_n, preset) => {
    expect(preset.summary.trim()).not.toBe('')
    expect(preset.tasks.every((task) => task.trim() !== '')).toBe(true)
  })
})

describe('the library as a whole', () => {
  it('addresses each programme by a key that cannot collide', () => {
    const keys = CHALLENGE_PRESETS.map((preset) => preset.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('offers one that forgives a miss beside one that does not', () => {
    // A fixed daily set is a useful shape without the punishment, and offering only the
    // punishing one would be the app taking a side it need not take.
    expect(CHALLENGE_PRESETS.some((preset) => preset.onMiss === 'restart')).toBe(true)
    expect(CHALLENGE_PRESETS.some((preset) => preset.onMiss === 'continue')).toBe(true)
  })

  it('ships 75 Hard with its own rule intact', () => {
    const hard = CHALLENGE_PRESETS.find((preset) => preset.key === '75-hard')

    expect(hard).toMatchObject({ lengthDays: 75, onMiss: 'restart' })
  })
})

describe('starting one', () => {
  it('gives every task an identifier of its own', () => {
    /*
     * Not baked into the preset. Starting 75 Hard twice must not share task ids between the
     * attempts, or a day recorded against one would satisfy the other — ticking one
     * programme silently completing another.
     */
    const [preset] = CHALLENGE_PRESETS
    const first = challengeFromPreset(preset!, mint())
    const second = challengeFromPreset(preset!, mint())

    const shared = first.tasks.filter((task) => second.tasks.some((other) => other.id === task.id))

    expect(shared).toEqual([])
  })

  it('starts on the day it was chosen rather than backdating one', () => {
    const [preset] = CHALLENGE_PRESETS

    expect(challengeFromPreset(preset!, mint()).startedOn).toBe(STARTED_ON)
  })
})
