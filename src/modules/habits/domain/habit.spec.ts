import { describe, expect, it } from 'vitest'

import { calendarDate, InvalidWeekdaysError } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'

import {
  archiveHabit,
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  InvalidFrequencyError,
  InvalidHabitNameError,
  InvalidMeasureError,
  isActiveOn,
  isMeasured,
  isNegative,
  isPositive,
  achievementFor,
  measure,
  outcomeFor,
  timesPerPeriod,
  namesItsDays,
  onWeekdays,
  timesDueOn,
} from './habit'

const CREATED_ON = calendarDate('2026-01-01')

function anyId() {
  return newIdentifier()
}

describe('frequency', () => {
  it('describes a period and how many times the habit recurs inside it', () => {
    expect(frequency('weekly', 2)).toEqual({ period: 'weekly', repetitions: 2 })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects the repetition count %s',
    (repetitions) => {
      expect(() => frequency('weekly', repetitions)).toThrow(InvalidFrequencyError)
    },
  )

  it('allows more repetitions than there are days in the period', () => {
    // Ten times a week is legitimate: instances may share a day.
    expect(() => frequency('weekly', 10)).not.toThrow()
  })
})

describe('timesPerPeriod', () => {
  it('reports how many instances a period must hold', () => {
    expect(timesPerPeriod(frequency('daily', 3))).toBe(3)
    expect(timesPerPeriod(frequency('yearly', 1))).toBe(1)
  })
})

describe('measure', () => {
  it('describes a unit, a partial credit threshold and a target', () => {
    expect(measure('litres', 0.5, 1)).toEqual({ unit: 'litres', minimum: 0.5, goal: 1 })
  })

  it('allows the minimum to equal the goal, making the habit all or nothing', () => {
    expect(() => measure('pages', 10, 10)).not.toThrow()
  })

  it('rejects a goal below the minimum, which would make partial unreachable', () => {
    expect(() => measure('litres', 2, 1)).toThrow(InvalidMeasureError)
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects the minimum %s', (minimum) => {
    expect(() => measure('litres', minimum, 5)).toThrow(InvalidMeasureError)
  })

  it.each(['', '   '])('rejects the blank unit "%s"', (unit) => {
    expect(() => measure(unit, 1, 2)).toThrow(InvalidMeasureError)
  })

  it('trims the unit', () => {
    expect(measure('  litres  ', 1, 2).unit).toBe('litres')
  })
})

describe('createCompletedHabit', () => {
  it('builds a positive habit that is simply done or not done', () => {
    const habit = createCompletedHabit({
      id: anyId(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    expect(habit.polarity).toBe('positive')
    expect(habit.tracking).toBe('completed')
    expect(habit.name).toBe('Meditate')
    expect(habit.archivedOn).toBeUndefined()
  })

  it('trims the name', () => {
    const habit = createCompletedHabit({
      id: anyId(),
      name: '  Meditate  ',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    expect(habit.name).toBe('Meditate')
  })

  it.each(['', '   '])('rejects the blank name "%s"', (name) => {
    expect(() =>
      createCompletedHabit({
        id: anyId(),
        name,
        frequency: frequency('daily', 1),
        createdOn: CREATED_ON,
      }),
    ).toThrow(InvalidHabitNameError)
  })

  it('rejects a name longer than the display limit', () => {
    expect(() =>
      createCompletedHabit({
        id: anyId(),
        name: 'a'.repeat(81),
        frequency: frequency('daily', 1),
        createdOn: CREATED_ON,
      }),
    ).toThrow(InvalidHabitNameError)
  })
})

describe('createMeasuredHabit', () => {
  it('builds a positive habit carrying a minimum and a goal', () => {
    const habit = createMeasuredHabit({
      id: anyId(),
      name: 'Drink water',
      frequency: frequency('daily', 1),
      measure: measure('litres', 0.5, 1),
      createdOn: CREATED_ON,
    })

    expect(habit.tracking).toBe('measured')
    expect(habit.measure).toEqual({ unit: 'litres', minimum: 0.5, goal: 1 })
  })
})

describe('createNegativeHabit', () => {
  it('builds a habit with no frequency, because it is judged every single day', () => {
    const habit = createNegativeHabit({
      id: anyId(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })

    expect(habit.polarity).toBe('negative')
    expect(habit).not.toHaveProperty('frequency')
  })
})

describe('outcomeFor', () => {
  const water = measure('litres', 0.5, 1)

  it('is done once the goal is reached', () => {
    expect(outcomeFor(water, 1)).toBe('done')
  })

  it('is done when the goal is exceeded', () => {
    expect(outcomeFor(water, 3)).toBe('done')
  })

  it('is partial between the minimum and the goal', () => {
    expect(outcomeFor(water, 0.75)).toBe('partial')
  })

  it('is partial exactly at the minimum, which is what the minimum means', () => {
    expect(outcomeFor(water, 0.5)).toBe('partial')
  })

  it('is missed below the minimum', () => {
    expect(outcomeFor(water, 0.25)).toBe('missed')
  })

  it('is missed at zero', () => {
    expect(outcomeFor(water, 0)).toBe('missed')
  })

  it('is done at the goal when the minimum equals the goal', () => {
    expect(outcomeFor(measure('pages', 10, 10), 10)).toBe('done')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('rejects the recorded value %s', (value) => {
    expect(() => outcomeFor(water, value)).toThrow(InvalidMeasureError)
  })
})

describe('archiveHabit', () => {
  const habit = createCompletedHabit({
    id: anyId(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })

  it('records the day the habit was retired without deleting its history', () => {
    const archived = archiveHabit(habit, calendarDate('2026-06-01'))

    expect(archived.archivedOn).toBe('2026-06-01')
    expect(archived.id).toBe(habit.id)
  })

  it('leaves the original untouched', () => {
    archiveHabit(habit, calendarDate('2026-06-01'))

    expect(habit.archivedOn).toBeUndefined()
  })

  it('refuses to archive before the habit existed', () => {
    expect(() => archiveHabit(habit, calendarDate('2025-12-31'))).toThrow(RangeError)
  })
})

describe('isActiveOn', () => {
  const habit = createCompletedHabit({
    id: anyId(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })

  it('is inactive before it was created', () => {
    expect(isActiveOn(habit, calendarDate('2025-12-31'))).toBe(false)
  })

  it('is active on the day it was created', () => {
    expect(isActiveOn(habit, CREATED_ON)).toBe(true)
  })

  it('is active after creation while it has not been archived', () => {
    expect(isActiveOn(habit, calendarDate('2026-09-09'))).toBe(true)
  })

  it('is still active on the day it is archived, since that day was lived', () => {
    const archived = archiveHabit(habit, calendarDate('2026-06-01'))

    expect(isActiveOn(archived, calendarDate('2026-06-01'))).toBe(true)
  })

  it('is inactive the day after it was archived', () => {
    const archived = archiveHabit(habit, calendarDate('2026-06-01'))

    expect(isActiveOn(archived, calendarDate('2026-06-02'))).toBe(false)
  })
})

describe('type guards', () => {
  const completed = createCompletedHabit({
    id: anyId(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
  const measured = createMeasuredHabit({
    id: anyId(),
    name: 'Drink water',
    frequency: frequency('daily', 1),
    measure: measure('litres', 0.5, 1),
    createdOn: CREATED_ON,
  })
  const negative = createNegativeHabit({ id: anyId(), name: 'Smoking', createdOn: CREATED_ON })

  it('separates positive from negative habits', () => {
    expect(isPositive(completed)).toBe(true)
    expect(isPositive(measured)).toBe(true)
    expect(isPositive(negative)).toBe(false)
    expect(isNegative(negative)).toBe(true)
  })

  it('recognises only the measured positive habit as measured', () => {
    expect(isMeasured(measured)).toBe(true)
    expect(isMeasured(completed)).toBe(false)
    expect(isMeasured(negative)).toBe(false)
  })
})

describe('achievementFor', () => {
  const water = measure('litres', 1, 2)

  it('is nothing at zero', () => {
    expect(achievementFor(water, 0)).toBe('none')
  })

  it('is below when there is something but not enough to count', () => {
    // Almost a good day, and grading it the same as nothing throws that away.
    expect(achievementFor(water, 0.5)).toBe('below')
  })

  it('is the minimum exactly at the minimum', () => {
    expect(achievementFor(water, 1)).toBe('minimum')
  })

  it('is above between the minimum and the goal', () => {
    expect(achievementFor(water, 1.5)).toBe('above')
  })

  it('is the goal exactly at the goal', () => {
    expect(achievementFor(water, 2)).toBe('goal')
  })

  it('is over past the goal', () => {
    expect(achievementFor(water, 3)).toBe('over')
  })

  it('reports the goal when the minimum equals it, which is the better thing to say', () => {
    expect(achievementFor(measure('pages', 10, 10), 10)).toBe('goal')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('rejects the value %s', (recorded) => {
    expect(() => achievementFor(water, recorded)).toThrow(InvalidMeasureError)
  })
})

describe('a recurrence that names its days', () => {
  it('is a weekly plan, because that is the period a set of weekdays repeats over', () => {
    expect(onWeekdays([1, 3, 5]).period).toBe('weekly')
  })

  it('derives how many times it happens rather than being told', () => {
    // Three named days is three times a week. Storing both is storing a disagreement
    // waiting to happen.
    expect(onWeekdays([1, 3, 5]).repetitions).toBe(3)
  })

  it('sorts the days, so two habits on the same days are written the same way', () => {
    expect(onWeekdays([5, 1, 3]).weekdays).toEqual([1, 3, 5])
  })

  it('refuses a plan with no days at all', () => {
    expect(() => onWeekdays([])).toThrow(InvalidWeekdaysError)
  })

  it.each([0, 8, -1, 1.5, Number.NaN])('refuses %s as a weekday', (day) => {
    expect(() => onWeekdays([day])).toThrow(InvalidWeekdaysError)
  })

  it('refuses the same day twice, which would inflate the count', () => {
    expect(() => onWeekdays([1, 1])).toThrow(InvalidWeekdaysError)
  })

  it('knows it names its days, and that a counted one does not', () => {
    expect(namesItsDays(onWeekdays([1]))).toBe(true)
    expect(namesItsDays(frequency('weekly', 1))).toBe(false)
  })
})

describe('how many times a day owes a habit', () => {
  const MONDAY = calendarDate('2026-03-09')
  const TUESDAY = calendarDate('2026-03-10')

  it('owes a named day once', () => {
    expect(timesDueOn(onWeekdays([1, 3, 5]), MONDAY)).toBe(1)
  })

  it('owes nothing on a day the plan does not name', () => {
    expect(timesDueOn(onWeekdays([1, 3, 5]), TUESDAY)).toBe(0)
  })

  it('owes a daily habit its full repetitions', () => {
    expect(timesDueOn(frequency('daily', 2), MONDAY)).toBe(2)
  })

  it('owes nothing for a counted weekly habit, whose day is a decision to be made', () => {
    // The planner exists to settle which day it lands on; the day cannot assume it.
    expect(timesDueOn(frequency('weekly', 3), MONDAY)).toBe(0)
  })
})
