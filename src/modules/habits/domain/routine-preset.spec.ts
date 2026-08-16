import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'
import { archiveHabit, createCompletedHabit, createNegativeHabit, frequency } from './habit'
import { createRoutine } from './routine'
import { importPreset, type RoutinePreset } from './routine-preset'

const TODAY = calendarDate('2026-03-11')
const EARLIER = calendarDate('2020-01-01')

function mint() {
  return { routineId: newIdentifier(), newHabitId: newIdentifier, today: TODAY }
}

function preset(steps: Array<[string, number]>, anchorTime?: number): RoutinePreset {
  return {
    key: 'morning',
    name: 'Morning',
    summary: 'A worked example.',
    ...(anchorTime === undefined ? {} : { anchorTime: timeOfDay(anchorTime) }),
    steps: steps.map(([name, durationMinutes]) => ({ name, durationMinutes })),
  }
}

function habitNamed(name: string, id: Identifier = newIdentifier()) {
  return createCompletedHabit({
    id,
    name,
    frequency: frequency('daily', 1),
    createdOn: EARLIER,
  })
}

const NOTHING = { habits: [], routines: [] }

describe('importing a preset into an empty app', () => {
  it('creates a habit for every step', () => {
    const result = importPreset(
      preset([
        ['Stretch', 10],
        ['Read', 20],
      ]),
      NOTHING,
      mint(),
    )

    expect(result.created.map((habit) => habit.name)).toEqual(['Stretch', 'Read'])
  })

  it('gives each created habit the length the preset states, so a build works at once', () => {
    const result = importPreset(preset([['Stretch', 10]]), NOTHING, mint())

    expect(result.created[0]).toMatchObject({ usualDurationMinutes: 10 })
  })

  it('creates the routine holding them in the preset’s order', () => {
    const result = importPreset(
      preset([
        ['Stretch', 10],
        ['Read', 20],
      ]),
      NOTHING,
      mint(),
    )
    const routine = result.routines.at(-1)

    expect(routine?.name).toBe('Morning')
    expect(routine?.habitIds).toEqual(result.created.map((habit) => habit.id))
  })

  it('carries the preset’s hour onto the routine', () => {
    const result = importPreset(preset([['Stretch', 10]], 6 * 60 + 30), NOTHING, mint())

    expect(result.routines.at(-1)).toMatchObject({ anchorTime: 6 * 60 + 30 })
  })

  it('leaves the routine without an hour when the preset states none', () => {
    const result = importPreset(preset([['Stretch', 10]]), NOTHING, mint())

    expect(result.routines.at(-1)).not.toHaveProperty('anchorTime')
  })
})

describe('importing a preset over habits that already exist', () => {
  it('reuses a habit of the same name instead of creating a second', () => {
    // The whole difficulty of the feature. A second "Meditate" splits a record in two, and
    // nothing afterwards can put it back together.
    const meditate = habitNamed('Meditate')
    const result = importPreset(
      preset([['Meditate', 10]]),
      { habits: [meditate], routines: [] },
      mint(),
    )

    expect(result.created).toEqual([])
    expect(result.reused).toEqual([meditate])
    expect(result.routines.at(-1)?.habitIds).toEqual([meditate.id])
  })

  it('matches the way a person would, ignoring case and stray spacing', () => {
    const meditate = habitNamed('meditate')
    const result = importPreset(
      preset([['  Meditate ', 10]]),
      { habits: [meditate], routines: [] },
      mint(),
    )

    expect(result.created).toEqual([])
    expect(result.reused).toEqual([meditate])
  })

  it('creates only the steps that are actually missing', () => {
    const meditate = habitNamed('Meditate')
    const result = importPreset(
      preset([
        ['Meditate', 10],
        ['Read', 20],
      ]),
      { habits: [meditate], routines: [] },
      mint(),
    )

    expect(result.reused.map((habit) => habit.name)).toEqual(['Meditate'])
    expect(result.created.map((habit) => habit.name)).toEqual(['Read'])
  })

  it('leaves a reused habit exactly as it was, history and all', () => {
    // Reusing means taking the habit, not rewriting it. Overwriting its length or its
    // creation day from a template would quietly discard what it had already recorded.
    const meditate = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('weekly', 3),
      createdOn: EARLIER,
      usualDurationMinutes: 45,
    })

    const result = importPreset(
      preset([['Meditate', 10]]),
      { habits: [meditate], routines: [] },
      mint(),
    )

    expect(result.reused[0]).toEqual(meditate)
  })

  it('never reuses a habit you are quitting, which is never performed', () => {
    const smoking = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: EARLIER,
    })

    const result = importPreset(
      preset([['Smoking', 10]]),
      { habits: [smoking], routines: [] },
      mint(),
    )

    expect(result.reused).toEqual([])
    expect(result.created).toHaveLength(1)
  })

  it('never revives an archived habit, which was a decision to stop', () => {
    // Reviving it as a side effect of importing a template would quietly undo that decision.
    // A new habit is the honest outcome: the archived one keeps the history it earned.
    const retired = archiveHabit(habitNamed('Meditate'), calendarDate('2026-01-01'))

    const result = importPreset(
      preset([['Meditate', 10]]),
      { habits: [retired], routines: [] },
      mint(),
    )

    expect(result.reused).toEqual([])
    expect(result.created).toHaveLength(1)
    expect(result.created[0]?.id).not.toBe(retired.id)
  })

  it('creates one habit for a step the preset happens to list twice', () => {
    // A routine refuses a repeated habit, so creating it twice would build a routine the
    // model then rejects — the import would fail on data the app itself shipped.
    const result = importPreset(
      preset([
        ['Stretch', 10],
        ['Stretch', 5],
      ]),
      NOTHING,
      mint(),
    )

    expect(result.created).toHaveLength(1)
    expect(result.routines.at(-1)?.habitIds).toHaveLength(1)
  })
})

describe('importing a preset over routines that already exist', () => {
  it('takes a reused habit out of the routine that had it', () => {
    // A habit belongs to at most one routine, and that is a rule about the whole set. Half a
    // move leaves it in two places.
    const meditate = habitNamed('Meditate')
    const evening = createRoutine({
      id: newIdentifier(),
      name: 'Evening',
      habitIds: [meditate.id],
      createdOn: EARLIER,
    })

    const result = importPreset(
      preset([['Meditate', 10]]),
      { habits: [meditate], routines: [evening] },
      mint(),
    )

    expect(result.routines.find((one) => one.id === evening.id)?.habitIds).toEqual([])
    expect(result.routines.at(-1)?.habitIds).toEqual([meditate.id])
  })

  it('leaves untouched a routine that shares nothing with the preset', () => {
    const evening = createRoutine({
      id: newIdentifier(),
      name: 'Evening',
      habitIds: [newIdentifier()],
      createdOn: EARLIER,
    })

    const result = importPreset(
      preset([['Stretch', 10]]),
      { habits: [], routines: [evening] },
      mint(),
    )

    expect(result.routines.find((one) => one.id === evening.id)).toBe(evening)
  })

  it('returns every routine to save, not only the new one', () => {
    const evening = createRoutine({
      id: newIdentifier(),
      name: 'Evening',
      habitIds: [],
      createdOn: EARLIER,
    })

    const result = importPreset(
      preset([['Stretch', 10]]),
      { habits: [], routines: [evening] },
      mint(),
    )

    expect(result.routines).toHaveLength(2)
  })
})
