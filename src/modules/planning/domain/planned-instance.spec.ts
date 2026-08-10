import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { InvalidTimeIntervalError, timeOfDay } from '@shared/domain/time-of-day'
import { frequency } from '@modules/habits/domain/habit'

import {
  countPlacedIn,
  DEFAULT_INSTANCE_DURATION_MINUTES,
  isScheduled,
  moveToDate,
  planInstance,
  remainingPlacements,
  resize,
  scheduleAt,
  spanOf,
  unschedule,
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
