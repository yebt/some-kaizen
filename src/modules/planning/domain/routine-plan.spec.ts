import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'
import {
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  type Habit,
  type PositiveHabit,
} from '@modules/habits/domain/habit'
import { createRoutine } from '@modules/habits/domain/routine'

import { impliedOccurrenceId } from './day-agenda'
import { planInstance, scheduleAt } from './planned-instance'
import { cascadeFrom, occurrencesFor, stepsFor, supersededBy } from './routine-plan'

const CREATED_ON = calendarDate('2020-01-01')
const DAY = calendarDate('2026-03-11')

function habitNamed(name: string, usualDurationMinutes?: number): PositiveHabit {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
    ...(usualDurationMinutes === undefined ? {} : { usualDurationMinutes }),
  })
}

function routineOver(habits: readonly Habit[], anchorTime?: number) {
  return createRoutine({
    id: newIdentifier(),
    name: 'Morning',
    habitIds: habits.map((habit) => habit.id),
    createdOn: CREATED_ON,
    ...(anchorTime === undefined ? {} : { anchorTime: timeOfDay(anchorTime) }),
  })
}

describe('the steps a routine offers', () => {
  it('lists them in the order the routine performs them', () => {
    const stretch = habitNamed('Stretch')
    const read = habitNamed('Read')
    const routine = routineOver([read, stretch])

    expect(stepsFor(routine, [stretch, read]).map((step) => step.habit.name)).toEqual([
      'Read',
      'Stretch',
    ])
  })

  it('gives each step the length its habit remembers', () => {
    const stretch = habitNamed('Stretch', 10)

    expect(stepsFor(routineOver([stretch]), [stretch])[0]?.durationMinutes).toBe(10)
  })

  it('falls back to the default length for a habit that has never said', () => {
    // The default is the size of a card nobody has measured. Using it here is what lets a
    // routine be built before every habit in it has been timed.
    const stretch = habitNamed('Stretch')

    expect(stepsFor(routineOver([stretch]), [stretch])[0]?.durationMinutes).toBe(30)
  })

  it('skips a habit that no longer exists rather than leaving a hole', () => {
    const stretch = habitNamed('Stretch')
    const routine = createRoutine({
      id: newIdentifier(),
      name: 'Morning',
      habitIds: [stretch.id, newIdentifier()],
      createdOn: CREATED_ON,
    })

    expect(stepsFor(routine, [stretch])).toHaveLength(1)
  })

  it('skips a habit you are quitting, which is never performed', () => {
    const smoking = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    const routine = createRoutine({
      id: newIdentifier(),
      name: 'Morning',
      habitIds: [smoking.id],
      createdOn: CREATED_ON,
    })

    expect(stepsFor(routine, [smoking])).toEqual([])
  })
})

describe('cascading the clock through the steps', () => {
  it('starts the first step at the hour given', () => {
    const [first] = cascadeFrom(timeOfDay(6 * 60), [
      { habit: habitNamed('Stretch'), durationMinutes: 10 },
    ]).steps

    expect(first?.startsAt).toBe(6 * 60)
  })

  it('starts each later step where the one before it ended', () => {
    const cascade = cascadeFrom(timeOfDay(6 * 60), [
      { habit: habitNamed('Stretch'), durationMinutes: 10 },
      { habit: habitNamed('Read'), durationMinutes: 20 },
      { habit: habitNamed('Shower'), durationMinutes: 15 },
    ])

    expect(cascade.steps.map((step) => step.startsAt)).toEqual([6 * 60, 6 * 60 + 10, 6 * 60 + 30])
  })

  it('reports where the whole routine ends, which is the number people check', () => {
    const cascade = cascadeFrom(timeOfDay(6 * 60), [
      { habit: habitNamed('Stretch'), durationMinutes: 10 },
      { habit: habitNamed('Read'), durationMinutes: 20 },
    ])

    expect(cascade.endsAt).toBe(6 * 60 + 30)
  })

  it('ends where it began when there is nothing in it', () => {
    expect(cascadeFrom(timeOfDay(6 * 60), []).endsAt).toBe(6 * 60)
  })

  it('changing one length moves everything after it and nothing before it', () => {
    // This is the whole point of the screen: a step that ran long pushes the rest of the
    // morning, and you can see how far before you commit to it.
    const steps = [
      { habit: habitNamed('Stretch'), durationMinutes: 10 },
      { habit: habitNamed('Read'), durationMinutes: 20 },
    ]
    const longer = [{ ...steps[0]!, durationMinutes: 25 }, steps[1]!]

    const before = cascadeFrom(timeOfDay(6 * 60), steps)
    const after = cascadeFrom(timeOfDay(6 * 60), longer)

    expect(after.steps[0]?.startsAt).toBe(before.steps[0]?.startsAt)
    expect(after.steps[1]?.startsAt).toBe(6 * 60 + 25)
  })
})

describe('a routine that runs past midnight', () => {
  it('keeps a step that starts before midnight, however long it lasts', () => {
    // A span may legitimately cross midnight — sleeping from 23:00 is the obvious case — and
    // only the start has to belong to the day, because the start is what pins the card.
    const cascade = cascadeFrom(timeOfDay(23 * 60 + 30), [
      { habit: habitNamed('Wind down'), durationMinutes: 60 },
    ])

    expect(cascade.steps).toHaveLength(1)
    expect(cascade.overflow).toEqual([])
  })

  it('holds back a step that would begin on the following day', () => {
    const spillsOver = { habit: habitNamed('Sleep'), durationMinutes: 30 }
    const cascade = cascadeFrom(timeOfDay(23 * 60), [
      { habit: habitNamed('Wind down'), durationMinutes: 90 },
      spillsOver,
    ])

    // Folded onto the clock it would read 00:30 and be drawn at the top of the same day,
    // hours before the step it follows. Held back and named instead of quietly relocated.
    expect(cascade.steps).toHaveLength(1)
    expect(cascade.overflow).toEqual([spillsOver])
  })

  it('holds back a step that would begin exactly at midnight', () => {
    // The boundary itself, because midnight is the first minute of the next day rather than
    // the last of this one. Off by one here places a card at 00:00 of the wrong day.
    const nextDay = { habit: habitNamed('Sleep'), durationMinutes: 30 }
    const cascade = cascadeFrom(timeOfDay(23 * 60), [
      { habit: habitNamed('Wind down'), durationMinutes: 60 },
      nextDay,
    ])

    expect(cascade.steps).toHaveLength(1)
    expect(cascade.overflow).toEqual([nextDay])
    expect(cascade.endsAt).toBe(0)
  })

  it('holds back every step after the first that does not fit', () => {
    const cascade = cascadeFrom(timeOfDay(23 * 60 + 50), [
      { habit: habitNamed('Wind down'), durationMinutes: 20 },
      { habit: habitNamed('Read'), durationMinutes: 20 },
      { habit: habitNamed('Sleep'), durationMinutes: 20 },
    ])

    expect(cascade.steps).toHaveLength(1)
    expect(cascade.overflow).toHaveLength(2)
  })
})

describe('the occurrences a build writes', () => {
  it('places one per step, at the time the cascade worked out', () => {
    const stretch = habitNamed('Stretch')
    const cascade = cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }])

    expect(occurrencesFor(cascade, DAY)[0]).toMatchObject({
      habitId: stretch.id,
      date: DAY,
      startsAt: 6 * 60,
      durationMinutes: 10,
    })
  })

  it('writes ordinary occurrences, not a record of its own kind', () => {
    // The builder is a third way to fill the day, next to dragging and typing a time. If it
    // wrote something else, every screen downstream would need to learn about it.
    const cascade = cascadeFrom(timeOfDay(6 * 60), [
      { habit: habitNamed('Stretch'), durationMinutes: 10 },
    ])
    const [occurrence] = occurrencesFor(cascade, DAY)

    expect(occurrence).toHaveProperty('periodKey')
    expect(occurrence).not.toHaveProperty('kind')
  })

  it('gives each the identity the day would have derived for it anyway', () => {
    // Anything else and the day would show the built card beside the duty it was built from,
    // claiming the habit is owed twice.
    const stretch = habitNamed('Stretch')
    const cascade = cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }])

    expect(occurrencesFor(cascade, DAY)[0]?.id).toBe(impliedOccurrenceId(stretch.id, DAY, 0))
  })

  it('writes nothing for a step that was held back', () => {
    const cascade = cascadeFrom(timeOfDay(23 * 60 + 50), [
      { habit: habitNamed('Wind down'), durationMinutes: 20 },
      { habit: habitNamed('Sleep'), durationMinutes: 20 },
    ])

    expect(occurrencesFor(cascade, DAY)).toHaveLength(1)
  })
})

describe('what a build replaces', () => {
  function existingFor(habitId: Identifier, id: Identifier, date = DAY) {
    return scheduleAt(planInstance({ id, habitId, date, period: 'daily' }), timeOfDay(19 * 60))
  }

  it('supersedes an occurrence the same habit already had that day', () => {
    // Building a morning is a statement about the whole morning. Leaving the card that was
    // already there would have the day claim the habit happens twice.
    const stretch = habitNamed('Stretch')
    const stale = existingFor(stretch.id, newIdentifier())
    const cascade = cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }])

    expect(supersededBy([stale], cascade, DAY)).toEqual([stale])
  })

  it('leaves alone an occurrence of a habit the routine does not contain', () => {
    const cascade = cascadeFrom(timeOfDay(6 * 60), [
      { habit: habitNamed('Stretch'), durationMinutes: 10 },
    ])

    expect(supersededBy([existingFor(newIdentifier(), newIdentifier())], cascade, DAY)).toEqual([])
  })

  it('leaves alone the same habit on a different day', () => {
    const stretch = habitNamed('Stretch')
    const elsewhere = existingFor(stretch.id, newIdentifier(), calendarDate('2026-03-12'))
    const cascade = cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }])

    expect(supersededBy([elsewhere], cascade, DAY)).toEqual([])
  })

  it('does not supersede the record it is about to write over', () => {
    // The built occurrence carries the derived identity, so saving it replaces that record in
    // place. Reporting it as superseded as well would have the caller delete what it just
    // wrote.
    const stretch = habitNamed('Stretch')
    const cascade = cascadeFrom(timeOfDay(6 * 60), [{ habit: stretch, durationMinutes: 10 }])
    const derived = existingFor(stretch.id, impliedOccurrenceId(stretch.id, DAY, 0))

    expect(supersededBy([derived], cascade, DAY)).toEqual([])
  })

  it('supersedes nothing for a step that was held back', () => {
    const sleep = habitNamed('Sleep')
    const stale = existingFor(sleep.id, newIdentifier())
    const cascade = cascadeFrom(timeOfDay(23 * 60 + 50), [
      { habit: habitNamed('Wind down'), durationMinutes: 20 },
      { habit: sleep, durationMinutes: 20 },
    ])

    // Nothing was placed for it, so removing what is already there would be destroying a
    // plan and putting nothing in its place.
    expect(supersededBy([stale], cascade, DAY)).toEqual([])
  })
})
