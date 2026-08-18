import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { InvalidTimeIntervalError, timeOfDay } from '@shared/domain/time-of-day'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'

import {
  countPlacedIn,
  hasReminder,
  InvalidReminderError,
  remindBefore,
  reminderOffsetMinutes,
  DEFAULT_INSTANCE_DURATION_MINUTES,
  isScheduled,
  moveToDate,
  planFor,
  planInstance,
  remainingPlacements,
  resize,
  scheduleAt,
  spanOf,
  unschedule,
  withoutReminder,
} from './planned-instance'

const HABIT = newIdentifier()

function anInstance(date = '2026-03-11', period: 'daily' | 'weekly' = 'weekly') {
  return planInstance({
    id: newIdentifier(),
    habitId: HABIT,
    date: calendarDate(date),
    period,
  })
}

describe('planInstance', () => {
  it('stamps the instance with the key of the period it belongs to', () => {
    expect(anInstance('2026-03-11', 'weekly').periodKey).toBe('2026-W11')
  })

  it('starts life unscheduled, placed on a day but not yet at a time', () => {
    const instance = anInstance()

    expect(instance.startsAt).toBeUndefined()
    expect(isScheduled(instance)).toBe(false)
  })

  it('carries a default duration so the timeline can give it a height', () => {
    expect(anInstance().durationMinutes).toBe(DEFAULT_INSTANCE_DURATION_MINUTES)
  })

  it('accepts an explicit duration', () => {
    const instance = planInstance({
      id: newIdentifier(),
      habitId: HABIT,
      date: calendarDate('2026-03-11'),
      period: 'weekly',
      durationMinutes: 90,
    })

    expect(instance.durationMinutes).toBe(90)
  })

  it.each([0, -30, 1441])('rejects the duration %s', (durationMinutes) => {
    expect(() =>
      planInstance({
        id: newIdentifier(),
        habitId: HABIT,
        date: calendarDate('2026-03-11'),
        period: 'weekly',
        durationMinutes,
      }),
    ).toThrow(InvalidTimeIntervalError)
  })
})

describe('scheduleAt', () => {
  it('assigns a time of day, which is the drop on the day timeline', () => {
    const scheduled = scheduleAt(anInstance(), timeOfDay(450))

    expect(scheduled.startsAt).toBe(450)
    expect(isScheduled(scheduled)).toBe(true)
  })

  it('leaves the original untouched', () => {
    const instance = anInstance()
    scheduleAt(instance, timeOfDay(450))

    expect(instance.startsAt).toBeUndefined()
  })

  it('keeps the day and the period key', () => {
    const instance = anInstance('2026-03-11', 'weekly')
    const scheduled = scheduleAt(instance, timeOfDay(450))

    expect(scheduled.date).toBe('2026-03-11')
    expect(scheduled.periodKey).toBe('2026-W11')
  })
})

describe('unschedule', () => {
  it('returns the instance to the day without a time', () => {
    const instance = unschedule(scheduleAt(anInstance(), timeOfDay(450)))

    expect(instance.startsAt).toBeUndefined()
    expect(isScheduled(instance)).toBe(false)
  })

  it('keeps the day it was planned on', () => {
    const instance = unschedule(scheduleAt(anInstance('2026-03-11'), timeOfDay(450)))

    expect(instance.date).toBe('2026-03-11')
  })
})

describe('moveToDate', () => {
  it('recomputes the period key when the move crosses a period boundary', () => {
    const instance = anInstance('2026-03-11', 'weekly')
    const moved = moveToDate(instance, calendarDate('2026-03-17'), 'weekly')

    expect(moved.date).toBe('2026-03-17')
    expect(moved.periodKey).toBe('2026-W12')
  })

  it('keeps the same key when the move stays inside the period', () => {
    const moved = moveToDate(anInstance('2026-03-11'), calendarDate('2026-03-13'), 'weekly')

    expect(moved.periodKey).toBe('2026-W11')
  })

  it('drops the assigned time, because a time chosen for one day is not a time for another', () => {
    const scheduled = scheduleAt(anInstance('2026-03-11'), timeOfDay(450))
    const moved = moveToDate(scheduled, calendarDate('2026-03-13'), 'weekly')

    expect(moved.startsAt).toBeUndefined()
  })
})

describe('resize', () => {
  it('changes how long the instance occupies the timeline', () => {
    expect(resize(anInstance(), 120).durationMinutes).toBe(120)
  })

  it.each([0, 1441])('rejects the duration %s', (durationMinutes) => {
    expect(() => resize(anInstance(), durationMinutes)).toThrow(InvalidTimeIntervalError)
  })
})

describe('spanOf', () => {
  it('is undefined while the instance has no time', () => {
    expect(spanOf(anInstance())).toBeUndefined()
  })

  it('is the interval the instance occupies once scheduled', () => {
    const scheduled = resize(scheduleAt(anInstance(), timeOfDay(1380)), 480)

    expect(spanOf(scheduled)).toEqual({ start: 1380, durationMinutes: 480 })
  })
})

describe('countPlacedIn', () => {
  it('counts only the instances stamped with the given period key', () => {
    const instances = [
      anInstance('2026-03-11', 'weekly'),
      anInstance('2026-03-13', 'weekly'),
      anInstance('2026-03-17', 'weekly'),
    ]

    expect(countPlacedIn(instances, '2026-W11')).toBe(2)
  })

  it('is zero when nothing has been placed in that period', () => {
    expect(countPlacedIn([anInstance('2026-03-11')], '2026-W40')).toBe(0)
  })
})

describe('remainingPlacements', () => {
  it('reports how many instances still need a day', () => {
    expect(remainingPlacements(frequency('weekly', 3), 1)).toBe(2)
  })

  it('is zero once the quota is met', () => {
    expect(remainingPlacements(frequency('weekly', 2), 2)).toBe(0)
  })

  it('never goes negative when more were placed than required', () => {
    // Over-placing is allowed; it must not read as a negative backlog.
    expect(remainingPlacements(frequency('weekly', 2), 5)).toBe(0)
  })
})

describe('reminders', () => {
  function scheduled(at = 450) {
    return scheduleAt(anInstance(), timeOfDay(at))
  }

  it('attaches a lead time to a scheduled occurrence', () => {
    expect(remindBefore(scheduled(), 15).reminderMinutesBefore).toBe(15)
  })

  it('accepts zero, which means at the time itself', () => {
    expect(remindBefore(scheduled(), 0).reminderMinutesBefore).toBe(0)
  })

  it('refuses an occurrence with no time rather than doing nothing quietly', () => {
    // A reminder that silently never fires is worse than one you were told you cannot set.
    expect(() => remindBefore(anInstance(), 15)).toThrow(InvalidReminderError)
  })

  it.each([-5, 1.5, 1441, Number.NaN])('refuses the lead time %s', (minutes) => {
    expect(() => remindBefore(scheduled(), minutes)).toThrow(InvalidReminderError)
  })

  it('reports when the reminder falls', () => {
    expect(reminderOffsetMinutes(remindBefore(scheduled(450), 15))).toBe(435)
  })

  it('goes negative when the reminder belongs to the previous evening', () => {
    // An hour before 00:30 is 23:30 the night before. Folding that onto the clock would
    // give 23:30 of the same day and fire seventeen hours late.
    expect(reminderOffsetMinutes(remindBefore(scheduled(30), 60))).toBe(-30)
  })

  it('has no offset without a reminder', () => {
    expect(reminderOffsetMinutes(scheduled())).toBeUndefined()
  })

  it('is removable', () => {
    const withReminder = remindBefore(scheduled(), 15)

    expect(hasReminder(withoutReminder(withReminder))).toBe(false)
  })

  it('loses the reminder when the time is taken away', () => {
    // A reminder counts back from a start that no longer exists.
    const withReminder = remindBefore(scheduled(), 15)

    expect(unschedule(withReminder).reminderMinutesBefore).toBeUndefined()
  })

  it('loses the reminder when the occurrence moves to another day', () => {
    const withReminder = remindBefore(scheduled(), 15)

    expect(
      moveToDate(withReminder, calendarDate('2026-03-13'), 'weekly').reminderMinutesBefore,
    ).toBeUndefined()
  })
})

describe('planning an occurrence for a habit', () => {
  const DAY = calendarDate('2026-03-09')

  function habitAt(usualTime?: number) {
    return createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: calendarDate('2020-01-01'),
      ...(usualTime === undefined ? {} : { usualTime: timeOfDay(usualTime) }),
    })
  }

  it('starts at the hour the habit usually happens at', () => {
    const instance = planFor(habitAt(7 * 60), { id: newIdentifier(), date: DAY })

    expect(instance.startsAt).toBe(timeOfDay(7 * 60))
  })

  it('leaves it without a time when the habit never named an hour', () => {
    // "Sometime today" is a real plan, and the planner has always allowed it.
    const instance = planFor(habitAt(), { id: newIdentifier(), date: DAY })

    expect(isScheduled(instance)).toBe(false)
  })

  it('counts against the habit own period, as any occurrence does', () => {
    const habit = habitAt(7 * 60)
    const instance = planFor(habit, { id: newIdentifier(), date: DAY })

    expect(instance.periodKey).toBe(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
      }).periodKey,
    )
  })

  it('takes the duration it is given, since a usual hour says nothing about length', () => {
    const instance = planFor(habitAt(7 * 60), {
      id: newIdentifier(),
      date: DAY,
      durationMinutes: 45,
    })

    expect(instance.durationMinutes).toBe(45)
  })
})
