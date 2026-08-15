import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { timeOfDay } from '@shared/domain/time-of-day'
import { newIdentifier } from '@shared/domain/identifier'
import {
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  type FrequencyPeriod,
  onWeekdays,
} from '@modules/habits/domain/habit'

import { dutiesFor, impliedOccurrenceId, spanFor } from './day-agenda'
import { DEFAULT_INSTANCE_DURATION_MINUTES, planInstance, scheduleAt } from './planned-instance'

const CREATED_ON = calendarDate('2020-01-01')
const TODAY = calendarDate('2026-03-11')

function habitOf(period: FrequencyPeriod, repetitions = 1, name = 'Meditate') {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency(period, repetitions),
    createdOn: CREATED_ON,
  })
}

function placedOn(habit: ReturnType<typeof habitOf>, day: string) {
  return planInstance({
    id: newIdentifier(),
    habitId: habit.id,
    date: calendarDate(day),
    period: habit.frequency.period,
  })
}

describe('a daily habit', () => {
  it('is due today without anyone placing it', () => {
    // Dragging seven cards a week onto seven days would be busywork with no choice in it.
    const habit = habitOf('daily')

    expect(dutiesFor([habit], [], TODAY)).toHaveLength(1)
  })

  it('is due as many times as it repeats', () => {
    expect(dutiesFor([habitOf('daily', 3)], [], TODAY)).toHaveLength(3)
  })

  it('counts a placed occurrence toward the day rather than beside it', () => {
    const habit = habitOf('daily', 2)
    const duties = dutiesFor([habit], [placedOn(habit, '2026-03-11')], TODAY)

    expect(duties).toHaveLength(2)
    expect(duties.filter((duty) => duty.instance !== undefined)).toHaveLength(1)
  })

  it('does not invent extra duties when it is already over placed', () => {
    const habit = habitOf('daily', 1)
    const placed = [placedOn(habit, '2026-03-11'), placedOn(habit, '2026-03-11')]

    expect(dutiesFor([habit], placed, TODAY)).toHaveLength(2)
  })

  it('is not due before it existed', () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: calendarDate('2026-04-01'),
    })

    expect(dutiesFor([habit], [], TODAY)).toEqual([])
  })

  it('is not due after it was archived', () => {
    const habit = { ...habitOf('daily'), archivedOn: calendarDate('2026-01-01') }

    expect(dutiesFor([habit], [], TODAY)).toEqual([])
  })
})

describe('a habit on a longer period', () => {
  it.each(['weekly', 'monthly', 'yearly'] as const)(
    'is not assumed onto today when it is %s',
    (period) => {
      // Which day it lands on is a real decision, and the planner exists to make it.
      expect(dutiesFor([habitOf(period)], [], TODAY)).toEqual([])
    },
  )

  it('appears once it has been placed on the day', () => {
    const habit = habitOf('weekly', 2)

    expect(dutiesFor([habit], [placedOn(habit, '2026-03-11')], TODAY)).toHaveLength(1)
  })

  it('ignores an occurrence placed on another day', () => {
    const habit = habitOf('weekly', 2)

    expect(dutiesFor([habit], [placedOn(habit, '2026-03-12')], TODAY)).toEqual([])
  })
})

describe('what never appears', () => {
  it('leaves negative habits out, since they are judged rather than performed', () => {
    const smoking = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })

    expect(dutiesFor([smoking], [], TODAY)).toEqual([])
  })

  it('drops an occurrence whose habit no longer exists', () => {
    const orphan = planInstance({
      id: newIdentifier(),
      habitId: newIdentifier(),
      date: TODAY,
      period: 'daily',
    })

    expect(dutiesFor([], [orphan], TODAY)).toEqual([])
  })
})

describe('the identity of an unplaced duty', () => {
  it('gives each unplaced duty a slot to derive its identity from', () => {
    const habit = habitOf('daily', 2)

    expect(dutiesFor([habit], [], TODAY).map((duty) => duty.slot)).toEqual([0, 1])
  })

  it('derives the same identifier on two devices that never spoke', () => {
    // This is the whole point: one real event, one record, however many devices notice it.
    const habit = habitOf('daily')

    expect(impliedOccurrenceId(habit.id, TODAY, 0)).toBe(impliedOccurrenceId(habit.id, TODAY, 0))
  })

  it('skips a slot whose occurrence already exists rather than reusing it', () => {
    // Completing one duty must not renumber the others out from under themselves.
    const habit = habitOf('daily', 2)
    const taken = planInstance({
      id: impliedOccurrenceId(habit.id, TODAY, 0),
      habitId: habit.id,
      date: TODAY,
      period: 'daily',
    })

    const duties = dutiesFor([habit], [taken], TODAY)
    const unplaced = duties.filter((duty) => duty.instance === undefined)

    expect(duties).toHaveLength(2)
    expect(unplaced.map((duty) => duty.slot)).toEqual([1])
  })

  it('keeps handing out fresh slots as earlier ones fill up', () => {
    const habit = habitOf('daily', 3)
    const filled = [0, 1].map((slot) =>
      planInstance({
        id: impliedOccurrenceId(habit.id, TODAY, slot),
        habitId: habit.id,
        date: TODAY,
        period: 'daily',
      }),
    )

    const unplaced = dutiesFor([habit], filled, TODAY).filter((duty) => duty.instance === undefined)

    expect(unplaced.map((duty) => duty.slot)).toEqual([2])
  })

  it('leaves a deliberately placed occurrence alone, since that one is genuinely its own', () => {
    // Three gym sessions someone actually planned are three things and must stay three.
    const habit = habitOf('daily', 1)
    const planned = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: TODAY,
      period: 'daily',
    })

    expect(dutiesFor([habit], [planned], TODAY)).toHaveLength(1)
  })
})

describe('a habit that named its own days', () => {
  const MONDAY = calendarDate('2026-03-09')
  const TUESDAY = calendarDate('2026-03-10')

  function gym() {
    return createCompletedHabit({
      id: newIdentifier(),
      name: 'Gym',
      frequency: onWeekdays([1, 3, 5]),
      createdOn: calendarDate('2020-01-01'),
    })
  }

  it('is due on a day it names without anyone planning it', () => {
    // The decision was made when the habit was created; making it again every week would be
    // busywork with no choice in it.
    expect(dutiesFor([gym()], [], MONDAY)).toHaveLength(1)
  })

  it('is not due on a day it does not name', () => {
    expect(dutiesFor([gym()], [], TUESDAY)).toEqual([])
  })

  it('is owed once on the day, not three times for the week', () => {
    expect(dutiesFor([gym()], [], MONDAY)).toHaveLength(1)
  })

  it('stops implying a duty once one has been placed on that day', () => {
    const habit = gym()
    const instance = planInstance({
      id: impliedOccurrenceId(habit.id, MONDAY, 0),
      habitId: habit.id,
      date: MONDAY,
      period: 'weekly',
    })

    expect(dutiesFor([habit], [instance], MONDAY)).toHaveLength(1)
  })

  it('leaves a counted weekly habit alone, whose day is still a decision', () => {
    const flexible = createCompletedHabit({
      id: newIdentifier(),
      name: 'Run',
      frequency: frequency('weekly', 3),
      createdOn: calendarDate('2020-01-01'),
    })

    expect(dutiesFor([flexible], [], MONDAY)).toEqual([])
  })

  it('stays quiet once archived, whatever days it named', () => {
    const retired = { ...gym(), archivedOn: calendarDate('2026-03-01') }

    expect(dutiesFor([retired], [], MONDAY)).toEqual([])
  })
})

describe('the span a duty is drawn at', () => {
  const AT_SEVEN = createCompletedHabit({
    id: newIdentifier(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
    usualTime: timeOfDay(7 * 60),
  })

  it('is the occurrence own time whenever there is an occurrence', () => {
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: AT_SEVEN.id,
        date: TODAY,
        period: 'daily',
      }),
      timeOfDay(9 * 60),
    )

    // Moving today card moved today, and today is what this reads back.
    expect(spanFor({ habit: AT_SEVEN, instance })?.start).toBe(timeOfDay(9 * 60))
  })

  it('falls back to the hour the habit usually happens at when nothing has been placed', () => {
    expect(spanFor({ habit: AT_SEVEN, slot: 0 })?.start).toBe(timeOfDay(7 * 60))
  })

  it('lasts the default duration, which the ruler can then be used to correct', () => {
    expect(spanFor({ habit: AT_SEVEN, slot: 0 })?.durationMinutes).toBe(
      DEFAULT_INSTANCE_DURATION_MINUTES,
    )
  })

  it('stays untimed once an occurrence has deliberately been given no time', () => {
    // Dragging a card off the ruler leaves an occurrence without a start. Re-applying the
    // usual hour there would make unscheduling impossible: the card would spring back.
    const loosened = planInstance({
      id: newIdentifier(),
      habitId: AT_SEVEN.id,
      date: TODAY,
      period: 'daily',
    })

    expect(spanFor({ habit: AT_SEVEN, instance: loosened })).toBeUndefined()
  })

  it('is nothing at all for a habit that never named an hour', () => {
    expect(spanFor({ habit: habitOf('daily'), slot: 0 })).toBeUndefined()
  })
})
