import { addDays, type CalendarDate, toDate, todayIn } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import { formatTime } from '@shared/domain/time-of-day'
import type { Habit } from '@modules/habits/domain/habit'
import {
  type PlannedInstance,
  reminderOffsetMinutes,
} from '@modules/planning/domain/planned-instance'

/** How far ahead reminders are scheduled. Android caps how many can be pending at once. */
export const HORIZON_DAYS = 14

export interface ScheduledReminder {
  /** A 32 bit identifier, because that is what the platform notification API takes. */
  readonly id: number
  readonly instanceId: Identifier
  readonly title: string
  readonly body: string
  readonly at: Date
}

/**
 * Turns an occurrence's reminder into a real instant.
 *
 * The offset is added to local midnight of the occurrence's own day, which is what makes a
 * negative offset land on the previous evening without any special case: an hour before a
 * 00:30 start is simply midnight minus thirty minutes. Building the date from local
 * components rather than from UTC is what keeps "07:00" meaning seven in the morning where
 * the user is, including across a daylight saving change.
 */
export function reminderInstant(instance: PlannedInstance): Date | undefined {
  const offset = reminderOffsetMinutes(instance)

  if (offset === undefined) return undefined

  const midnight = toDate(instance.date)

  return new Date(midnight.getTime() + offset * 60_000)
}

/**
 * A stable numeric id for an occurrence.
 *
 * The platform wants a 32 bit integer while our identifiers are UUIDs, so the UUID is
 * folded down. Deriving it rather than counting means rescheduling replaces the same
 * notification instead of stacking a second copy beside it. Two occurrences colliding is
 * possible in principle and vanishingly unlikely for one person's habits.
 */
export function notificationIdFor(instanceId: Identifier): number {
  let hash = 0

  for (let index = 0; index < instanceId.length; index += 1) {
    hash = (Math.imul(hash, 31) + instanceId.charCodeAt(index)) | 0
  }

  // Kept positive: some platforms reject a negative notification id.
  return Math.abs(hash) % 2_147_483_647
}

/**
 * Every reminder worth scheduling right now.
 *
 * Reminders already in the past are dropped rather than fired late, because a notification
 * for something that was meant to happen yesterday is noise, not help. The horizon exists
 * because the platform limits how many notifications can be pending, so the far future is
 * scheduled later rather than crowding out this week.
 */
export function pendingReminders(
  habits: readonly Habit[],
  instances: readonly PlannedInstance[],
  now: Date,
  horizonDays: number = HORIZON_DAYS,
): ScheduledReminder[] {
  const names = new Map(habits.map((habit) => [habit.id, habit.name]))
  const lastDay: CalendarDate = addDays(todayIn(now), horizonDays)

  return instances
    .flatMap((instance) => {
      const at = reminderInstant(instance)
      const name = names.get(instance.habitId)

      if (!at || !name || instance.startsAt === undefined) return []
      if (at.getTime() <= now.getTime()) return []
      if (instance.date > lastDay) return []

      return [
        {
          id: notificationIdFor(instance.id),
          instanceId: instance.id,
          title: name,
          body:
            instance.reminderMinutesBefore === 0
              ? `Starting now, ${formatTime(instance.startsAt)}`
              : `In ${instance.reminderMinutesBefore} minutes, at ${formatTime(instance.startsAt)}`,
          at,
        },
      ]
    })
    .sort((left, right) => left.at.getTime() - right.at.getTime())
}
