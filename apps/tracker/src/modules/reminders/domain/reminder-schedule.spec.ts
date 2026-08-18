import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { planInstance, remindBefore, scheduleAt } from '@modules/planning/domain/planned-instance'

import { notificationIdFor, pendingReminders, reminderInstant } from './reminder-schedule'

const CREATED_ON = calendarDate('2020-01-01')

function habit(name = 'Meditate') {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function occurrence(habitId: ReturnType<typeof newIdentifier>, day: string, at: number) {
  return scheduleAt(
    planInstance({ id: newIdentifier(), habitId, date: calendarDate(day), period: 'daily' }),
    timeOfDay(at),
  )
}

describe('reminderInstant', () => {
  it('lands at the lead time before the start', () => {
    const instance = remindBefore(occurrence(newIdentifier(), '2026-03-11', 7 * 60), 15)
    const at = reminderInstant(instance)

    expect(at?.getFullYear()).toBe(2026)
    expect(at?.getMonth()).toBe(2)
    expect(at?.getDate()).toBe(11)
    expect(at?.getHours()).toBe(6)
    expect(at?.getMinutes()).toBe(45)
  })

  it('lands on the previous evening when the lead time crosses midnight', () => {
    // An hour before a 00:30 start. The negative offset carries this with no special case.
    const instance = remindBefore(occurrence(newIdentifier(), '2026-03-11', 30), 60)
    const at = reminderInstant(instance)

    expect(at?.getDate()).toBe(10)
    expect(at?.getHours()).toBe(23)
    expect(at?.getMinutes()).toBe(30)
  })

  it('is the start itself for a lead time of zero', () => {
    const instance = remindBefore(occurrence(newIdentifier(), '2026-03-11', 7 * 60), 0)

    expect(reminderInstant(instance)?.getHours()).toBe(7)
  })

  it('is built from local components, so a time means that time where the user is', () => {
    const instance = remindBefore(occurrence(newIdentifier(), '2026-07-15', 9 * 60), 0)

    expect(reminderInstant(instance)?.getHours()).toBe(9)
  })

  it('is nothing without a reminder', () => {
    expect(reminderInstant(occurrence(newIdentifier(), '2026-03-11', 420))).toBeUndefined()
  })
})

describe('notificationIdFor', () => {
  it('is stable, so rescheduling replaces rather than stacks a second copy', () => {
    const id = newIdentifier()

    expect(notificationIdFor(id)).toBe(notificationIdFor(id))
  })

  it('is positive, since some platforms reject a negative id', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(notificationIdFor(newIdentifier())).toBeGreaterThanOrEqual(0)
    }
  })

  it('fits in the 32 bit range the platform accepts', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(notificationIdFor(newIdentifier())).toBeLessThan(2_147_483_647)
    }
  })

  it('separates two different occurrences', () => {
    expect(notificationIdFor(newIdentifier())).not.toBe(notificationIdFor(newIdentifier()))
  })
})

describe('pendingReminders', () => {
  const now = new Date(2026, 2, 11, 6, 0)

  it('schedules a reminder still ahead of us', () => {
    const meditate = habit()
    const instance = remindBefore(occurrence(meditate.id, '2026-03-11', 7 * 60), 15)

    const reminders = pendingReminders([meditate], [instance], now)

    expect(reminders).toHaveLength(1)
    expect(reminders[0]?.title).toBe('Meditate')
  })

  it('drops one already in the past rather than firing it late', () => {
    // A notification for something meant to happen this morning is noise, not help.
    const meditate = habit()
    const instance = remindBefore(occurrence(meditate.id, '2026-03-11', 5 * 60), 15)

    expect(pendingReminders([meditate], [instance], now)).toEqual([])
  })

  it('ignores an occurrence with no reminder', () => {
    const meditate = habit()

    expect(pendingReminders([meditate], [occurrence(meditate.id, '2026-03-11', 600)], now)).toEqual(
      [],
    )
  })

  it('ignores one beyond the horizon, which the platform could not hold anyway', () => {
    const meditate = habit()
    const instance = remindBefore(occurrence(meditate.id, '2026-06-01', 7 * 60), 15)

    expect(pendingReminders([meditate], [instance], now)).toEqual([])
  })

  it('ignores an occurrence whose habit no longer exists', () => {
    const instance = remindBefore(occurrence(newIdentifier(), '2026-03-11', 7 * 60), 15)

    expect(pendingReminders([], [instance], now)).toEqual([])
  })

  it('orders them so the soonest is first', () => {
    const meditate = habit()
    const later = remindBefore(occurrence(meditate.id, '2026-03-12', 7 * 60), 15)
    const sooner = remindBefore(occurrence(meditate.id, '2026-03-11', 20 * 60), 15)

    const reminders = pendingReminders([meditate], [later, sooner], now)

    expect(reminders.map((reminder) => reminder.instanceId)).toEqual([sooner.id, later.id])
  })

  it('says the habit is starting now for a lead time of zero', () => {
    const meditate = habit()
    const instance = remindBefore(occurrence(meditate.id, '2026-03-11', 7 * 60), 0)

    expect(pendingReminders([meditate], [instance], now)[0]?.body).toContain('Starting now')
  })

  it('says how long is left for any other lead time', () => {
    const meditate = habit()
    const instance = remindBefore(occurrence(meditate.id, '2026-03-11', 7 * 60), 30)

    expect(pendingReminders([meditate], [instance], now)[0]?.body).toContain('In 30 minutes')
  })
})
