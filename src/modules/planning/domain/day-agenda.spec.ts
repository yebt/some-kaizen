import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import {
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  type FrequencyPeriod,
} from '@modules/habits/domain/habit'

import { dutiesFor } from './day-agenda'
import { planInstance } from './planned-instance'

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
