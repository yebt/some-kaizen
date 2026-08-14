import { describe, expect, it } from 'vitest'

import { calendarDate, eachDayBetween } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import {
  createCompletedHabit,
  frequency,
  type FrequencyPeriod,
  onWeekdays,
} from '@modules/habits/domain/habit'

import { needsPlacing, remainingPlacementsAcross } from './placement-plan'
import { planInstance } from './planned-instance'

const CREATED_ON = calendarDate('2026-01-01')

// Monday the 9th through Sunday the 15th of March 2026.
const WEEK = eachDayBetween(calendarDate('2026-03-09'), calendarDate('2026-03-15'))

function habitOf(period: FrequencyPeriod, repetitions: number) {
  return createCompletedHabit({
    id: newIdentifier(),
    name: 'Run',
    frequency: frequency(period, repetitions),
    createdOn: CREATED_ON,
  })
}

function placedOn(habit: ReturnType<typeof habitOf>, ...days: string[]) {
  return days.map((day) =>
    planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: calendarDate(day),
      period: habit.frequency.period,
    }),
  )
}

describe('a weekly habit', () => {
  it('needs its whole quota when nothing is placed', () => {
    const habit = habitOf('weekly', 2)

    expect(remainingPlacementsAcross(habit, [], WEEK)).toBe(2)
  })

  it('needs one less for each day it is already on', () => {
    const habit = habitOf('weekly', 2)

    expect(remainingPlacementsAcross(habit, placedOn(habit, '2026-03-10'), WEEK)).toBe(1)
  })

  it('needs nothing once the week is satisfied', () => {
    const habit = habitOf('weekly', 2)
    const placed = placedOn(habit, '2026-03-10', '2026-03-12')

    expect(remainingPlacementsAcross(habit, placed, WEEK)).toBe(0)
  })

  it('counts two occurrences on one day toward the same weekly quota', () => {
    const habit = habitOf('weekly', 2)
    const placed = placedOn(habit, '2026-03-10', '2026-03-10')

    expect(remainingPlacementsAcross(habit, placed, WEEK)).toBe(0)
  })

  it('ignores occurrences belonging to another week', () => {
    const habit = habitOf('weekly', 2)

    expect(remainingPlacementsAcross(habit, placedOn(habit, '2026-03-17'), WEEK)).toBe(2)
  })

  it('ignores another habit’s occurrences', () => {
    const habit = habitOf('weekly', 2)
    const other = habitOf('weekly', 2)

    expect(remainingPlacementsAcross(habit, placedOn(other, '2026-03-10'), WEEK)).toBe(2)
  })
})

describe('a daily habit', () => {
  it('needs one for every day of the week', () => {
    const habit = habitOf('daily', 1)

    expect(remainingPlacementsAcross(habit, [], WEEK)).toBe(7)
  })

  it('counts a shortfall per day rather than for the week as a whole', () => {
    const habit = habitOf('daily', 1)
    const placed = placedOn(habit, '2026-03-09', '2026-03-10')

    expect(remainingPlacementsAcross(habit, placed, WEEK)).toBe(5)
  })

  it('does not let two on one day cover another day', () => {
    // Meditating twice on Monday leaves Tuesday just as empty as before.
    const habit = habitOf('daily', 1)
    const placed = placedOn(habit, '2026-03-09', '2026-03-09')

    expect(remainingPlacementsAcross(habit, placed, WEEK)).toBe(6)
  })

  it('asks for the full repetition count on each day', () => {
    const habit = habitOf('daily', 3)

    expect(remainingPlacementsAcross(habit, [], WEEK)).toBe(21)
  })
})

describe('a habit that is not active all week', () => {
  it('ignores days before it was created', () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Run',
      frequency: frequency('daily', 1),
      createdOn: calendarDate('2026-03-12'),
    })

    expect(remainingPlacementsAcross(habit, [], WEEK)).toBe(4)
  })

  it('ignores days after it was archived', () => {
    const habit = {
      ...habitOf('daily', 1),
      archivedOn: calendarDate('2026-03-10'),
    }

    expect(remainingPlacementsAcross(habit, [], WEEK)).toBe(2)
  })
})

describe('a monthly habit in a week that straddles two months', () => {
  const straddling = eachDayBetween(calendarDate('2026-03-30'), calendarDate('2026-04-05'))

  it('reports the shortfall of both months rather than guessing one', () => {
    const habit = habitOf('monthly', 1)

    expect(remainingPlacementsAcross(habit, [], straddling)).toBe(2)
  })

  it('drops the month already satisfied', () => {
    const habit = habitOf('monthly', 1)

    expect(remainingPlacementsAcross(habit, placedOn(habit, '2026-03-31'), straddling)).toBe(1)
  })
})

describe('over placing', () => {
  it('never reports a negative backlog', () => {
    const habit = habitOf('weekly', 1)
    const placed = placedOn(habit, '2026-03-09', '2026-03-10', '2026-03-11')

    expect(remainingPlacementsAcross(habit, placed, WEEK)).toBe(0)
  })
})

describe('deciding whether a day is even a decision', () => {
  it('asks for a weekly habit, whose day is genuinely open', () => {
    expect(needsPlacing(habitOf('weekly', 3))).toBe(true)
  })

  it('asks for a monthly habit, which is the same decision on a longer period', () => {
    expect(needsPlacing(habitOf('monthly', 1))).toBe(true)
  })

  it('does not ask for a daily habit, whose period is the day itself', () => {
    expect(needsPlacing(habitOf('daily', 1))).toBe(false)
  })

  it('does not ask for a habit that already named its days', () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Run',
      frequency: onWeekdays([1, 3, 5]),
      createdOn: CREATED_ON,
    })

    expect(needsPlacing(habit)).toBe(false)
  })
})
