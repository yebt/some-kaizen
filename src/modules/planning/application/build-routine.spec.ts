import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { createPersistence, type Persistence } from '@core/persistence'
import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'
import { createCompletedHabit, frequency, type PositiveHabit } from '@modules/habits/domain/habit'
import { impliedOccurrenceId } from '@modules/planning/domain/day-agenda'
import { planInstance, scheduleAt } from '@modules/planning/domain/planned-instance'
import { cascadeFrom } from '@modules/planning/domain/routine-plan'

import { buildRoutine } from './build-routine'

const CREATED_ON = calendarDate('2020-01-01')
const DAY = calendarDate('2026-03-11')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`build-routine-spec-${databaseCounter}`)
})

function habitNamed(name: string): PositiveHabit {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function placed(habit: PositiveHabit, at: number, date = DAY) {
  return scheduleAt(
    planInstance({ id: newIdentifier(), habitId: habit.id, date, period: 'daily' }),
    timeOfDay(at),
  )
}

describe('building a routine onto a day', () => {
  it('stores an occurrence for each step, at the cascaded time', async () => {
    const stretch = habitNamed('Stretch')
    const read = habitNamed('Read')

    await buildRoutine(
      persistence,
      cascadeFrom(timeOfDay(6 * 60), [
        { habit: stretch, durationMinutes: 10 },
        { habit: read, durationMinutes: 20 },
      ]),
      DAY,
    )

    const stored = await persistence.instances.all()

    expect(stored).toHaveLength(2)
    expect(stored.find((one) => one.habitId === read.id)).toMatchObject({
      startsAt: 6 * 60 + 10,
      durationMinutes: 20,
    })
  })

  it('replaces a card the same habit already had on that day', async () => {
    // Building a morning is a statement about the whole morning. Leaving what was there
    // would have the day claim the habit happens twice.
    const stretch = habitNamed('Stretch')

    await persistence.instances.save(placed(stretch, 19 * 60))
    await buildRoutine(
      persistence,
      cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }]),
      DAY,
    )

    const stored = await persistence.instances.all()

    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ startsAt: 6 * 60 })
  })

  it('leaves a habit the routine says nothing about exactly where it was', async () => {
    const stretch = habitNamed('Stretch')
    const run = habitNamed('Run')
    const untouched = placed(run, 19 * 60)

    await persistence.instances.save(untouched)
    await buildRoutine(
      persistence,
      cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }]),
      DAY,
    )

    expect((await persistence.instances.all()).find((one) => one.habitId === run.id)).toEqual(
      untouched,
    )
  })

  it('leaves the same habit alone on every other day', async () => {
    const stretch = habitNamed('Stretch')
    const tomorrow = placed(stretch, 19 * 60, calendarDate('2026-03-12'))

    await persistence.instances.save(tomorrow)
    await buildRoutine(
      persistence,
      cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }]),
      DAY,
    )

    expect((await persistence.instances.all()).find((one) => one.id === tomorrow.id)).toEqual(
      tomorrow,
    )
  })

  it('building twice leaves one card, not two', async () => {
    // The derived identity is what makes a rebuild an edit rather than a duplication. Someone
    // adjusting a wake time and pressing Build again is the ordinary case, not the odd one.
    const stretch = habitNamed('Stretch')

    await buildRoutine(
      persistence,
      cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }]),
      DAY,
    )
    await buildRoutine(
      persistence,
      cascadeFrom(timeOfDay(7 * 60), [{ habit: stretch, durationMinutes: 10 }]),
      DAY,
    )

    const stored = await persistence.instances.all()

    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ startsAt: 7 * 60 })
  })

  it('gives each occurrence the identity the day derives, so nothing is counted twice', async () => {
    const stretch = habitNamed('Stretch')

    await buildRoutine(
      persistence,
      cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }]),
      DAY,
    )

    expect((await persistence.instances.all())[0]?.id).toBe(impliedOccurrenceId(stretch.id, DAY, 0))
  })

  it('writes nothing, and removes nothing, for a step that ran off the end of the day', async () => {
    const windDown = habitNamed('Wind down')
    const sleep = habitNamed('Sleep')
    const alreadyThere = placed(sleep, 19 * 60)

    await persistence.instances.save(alreadyThere)
    await buildRoutine(
      persistence,
      cascadeFrom(timeOfDay(23 * 60 + 50), [
        { habit: windDown, durationMinutes: 20 },
        { habit: sleep, durationMinutes: 20 },
      ]),
      DAY,
    )

    const stored = await persistence.instances.all()

    expect(stored.find((one) => one.habitId === sleep.id)).toEqual(alreadyThere)
    expect(stored.find((one) => one.habitId === windDown.id)).toMatchObject({
      startsAt: 23 * 60 + 50,
    })
  })
})
