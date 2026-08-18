import { describe, expect, it } from 'vitest'

import { addDays, calendarDate, weekday } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import {
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  onWeekdays,
} from '@modules/habits/domain/habit'
import { recordCompleted, recordNegative } from '@modules/habits/domain/habit-entry'

import { weekdayBreakdown } from './weekday-breakdown'

const CREATED_ON = calendarDate('2020-01-01')

/** 2026-03-02 is a Monday, so the window below is eight whole weeks starting on one. */
const FROM = calendarDate('2026-03-02')
const TO = calendarDate('2026-04-26')

const MONDAY = 1
const TUESDAY = 2

function habit() {
  return createCompletedHabit({
    id: newIdentifier(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

/** Every date in the window falling on the given weekday. */
function everyWeekday(target: number): string[] {
  const days: string[] = []

  for (let date = FROM; date <= TO; date = addDays(date, 1)) {
    if (weekday(date) === target) days.push(date)
  }

  return days
}

function answered(subject: ReturnType<typeof habit>, target: number, outcomes: readonly boolean[]) {
  return everyWeekday(target)
    .slice(0, outcomes.length)
    .map((date, index) =>
      recordCompleted(newIdentifier(), subject, calendarDate(date), outcomes[index] ?? false),
    )
}

function rateOn(
  breakdown: ReturnType<typeof weekdayBreakdown>,
  target: number,
): number | undefined {
  return breakdown.days.find((day) => day.weekday === target)?.rate
}

describe('how a habit goes on each day of the week', () => {
  it('reports a rate per weekday', () => {
    const subject = habit()
    const entries = answered(subject, MONDAY, [true, true, false, true])

    expect(rateOn(weekdayBreakdown(subject, entries, FROM, TO), MONDAY)).toBeCloseTo(3 / 4)
  })

  it('leaves a weekday with no answers without a rate at all', () => {
    // Zero would read as "you fail every Thursday" when the truth is "you have not said".
    const subject = habit()
    const entries = answered(subject, MONDAY, [true, true])

    expect(rateOn(weekdayBreakdown(subject, entries, FROM, TO), TUESDAY)).toBeUndefined()
  })

  it('measures against days answered, not against every day in the window', () => {
    // Counting unanswered days as failures would make a fortnight away from the app read as
    // a collapse in discipline.
    const subject = habit()
    const entries = answered(subject, MONDAY, [true, true])
    const breakdown = weekdayBreakdown(subject, entries, FROM, TO)
    const monday = breakdown.days.find((day) => day.weekday === MONDAY)

    expect(monday?.answered).toBe(2)
    expect(monday?.rate).toBe(1)
  })

  it('counts a day once however many occurrences it held', () => {
    /*
     * A habit due three times a day writes three entries that all currently stand, because
     * each answers a different occurrence. Counting them separately would let one busy
     * Wednesday outweigh a month of Mondays, and the question here is how the weekdays go
     * rather than how much happened.
     *
     * The occurrence identifiers matter: without them the entries collapse to one per day
     * upstream and this would pass whether or not the rule exists.
     */
    const subject = habit()
    const [firstMonday] = everyWeekday(MONDAY)
    const day = calendarDate(firstMonday!)

    const entries = [
      recordCompleted(newIdentifier(), subject, day, true, { instanceId: newIdentifier() }),
      recordCompleted(newIdentifier(), subject, day, true, { instanceId: newIdentifier() }),
      recordCompleted(newIdentifier(), subject, day, true, { instanceId: newIdentifier() }),
    ]

    expect(weekdayBreakdown(subject, entries, FROM, TO).days[0]?.answered).toBe(1)
  })

  it('does not let a repeated day outweigh the days around it', () => {
    const subject = habit()
    const [busyMonday] = everyWeekday(MONDAY)
    const goodMondays = everyWeekday(MONDAY).slice(1, 3)

    const entries = [
      // Three failed slots on one Monday, which is still one bad Monday.
      ...Array.from({ length: 3 }, () =>
        recordCompleted(newIdentifier(), subject, calendarDate(busyMonday!), false, {
          instanceId: newIdentifier(),
        }),
      ),
      ...goodMondays.map((date) =>
        recordCompleted(newIdentifier(), subject, calendarDate(date), true),
      ),
    ]

    expect(rateOn(weekdayBreakdown(subject, entries, FROM, TO), MONDAY)).toBeCloseTo(2 / 3)
  })

  it('reads only the verdict that currently stands', () => {
    // Marking a day done and then undoing it must not count as a completion and a miss.
    const subject = habit()
    const [firstMonday] = everyWeekday(MONDAY)
    const day = calendarDate(firstMonday!)

    const entries = [
      recordCompleted(newIdentifier(), subject, day, true, { recordedAt: 1 }),
      recordCompleted(newIdentifier(), subject, day, false, { recordedAt: 2 }),
    ]

    expect(rateOn(weekdayBreakdown(subject, entries, FROM, TO), MONDAY)).toBe(0)
  })

  it('ignores an answer outside the window', () => {
    const subject = habit()
    const outside = recordCompleted(newIdentifier(), subject, calendarDate('2026-01-05'), true)

    expect(rateOn(weekdayBreakdown(subject, [outside], FROM, TO), MONDAY)).toBeUndefined()
  })
})

describe('naming the best and worst day', () => {
  it('names them when the week is genuinely uneven', () => {
    const subject = habit()
    const entries = [
      ...answered(subject, MONDAY, [true, true, true, true]),
      ...answered(subject, TUESDAY, [false, false, true, false]),
    ]

    const breakdown = weekdayBreakdown(subject, entries, FROM, TO)

    expect(breakdown.best?.weekday).toBe(MONDAY)
    expect(breakdown.worst?.weekday).toBe(TUESDAY)
  })

  it('names neither on a flat week, because there is no pattern to name', () => {
    const subject = habit()
    const entries = [
      ...answered(subject, MONDAY, [true, true]),
      ...answered(subject, TUESDAY, [true, true]),
    ]

    const breakdown = weekdayBreakdown(subject, entries, FROM, TO)

    expect(breakdown.best).toBeUndefined()
    expect(breakdown.worst).toBeUndefined()
  })

  it('says nothing off a single answer, which is not a pattern', () => {
    // "Best day: Tuesday, 100%" from one good Tuesday teaches someone to trust a number that
    // moves the moment they answer again.
    const subject = habit()
    const entries = [...answered(subject, MONDAY, [true]), ...answered(subject, TUESDAY, [false])]

    const breakdown = weekdayBreakdown(subject, entries, FROM, TO)

    expect(breakdown.best).toBeUndefined()
  })

  it('says nothing when only one weekday has been answered enough to read', () => {
    const subject = habit()
    const entries = [
      ...answered(subject, MONDAY, [true, true, true]),
      ...answered(subject, TUESDAY, [false]),
    ]

    expect(weekdayBreakdown(subject, entries, FROM, TO).best).toBeUndefined()
  })
})

describe('habits whose days are named', () => {
  it('does not count a weekday the habit never claimed', () => {
    // A Monday-Wednesday-Friday habit has no opinion about Sunday, and a 0% there would
    // describe the schedule rather than the person.
    const gym = createCompletedHabit({
      id: newIdentifier(),
      name: 'Gym',
      frequency: onWeekdays([1, 3, 5]),
      createdOn: CREATED_ON,
    })

    const [firstSunday] = everyWeekday(7)
    const stray = recordCompleted(newIdentifier(), gym, calendarDate(firstSunday!), false)

    expect(rateOn(weekdayBreakdown(gym, [stray], FROM, TO), 7)).toBeUndefined()
  })
})

describe('a habit being quit', () => {
  it('counts an avoided day as kept', () => {
    const smoking = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })

    const mondays = everyWeekday(MONDAY).slice(0, 2)
    const entries = mondays.map((date, index) =>
      recordNegative(
        newIdentifier(),
        smoking,
        calendarDate(date),
        index === 0 ? 'avoided' : 'relapsed',
        addDays(calendarDate(date), 1),
      ),
    )

    expect(rateOn(weekdayBreakdown(smoking, entries, FROM, TO), MONDAY)).toBe(0.5)
  })
})
