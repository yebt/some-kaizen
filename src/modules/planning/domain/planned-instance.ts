import type { CalendarDate } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import {
  assertDuration,
  interval,
  MINUTES_PER_DAY,
  type TimeInterval,
  type TimeOfDay,
} from '@shared/domain/time-of-day'
import type { Frequency, FrequencyPeriod } from '@modules/habits/domain/habit'

import { periodKeyFor } from './period'

/** Half an hour, long enough to be grabbable on a phone timeline without dominating it. */
export const DEFAULT_INSTANCE_DURATION_MINUTES = 30

/**
 * One occurrence of a habit, placed on a day and optionally pinned to a time.
 *
 * Placement happens in two separate gestures, which is why the day and the time are
 * separate fields. First you drag the occurrence onto a day in the period view, answering
 * "when this week?". Only later, inside that day, do you drag it onto the timeline,
 * answering "when today?". An instance that never gets the second gesture is perfectly
 * valid: it simply happens sometime that day.
 */
export interface PlannedInstance {
  readonly id: Identifier
  readonly habitId: Identifier
  readonly date: CalendarDate
  /** The period this occurrence is counted against, so quotas survive month and year edges. */
  readonly periodKey: string
  readonly startsAt?: TimeOfDay
  readonly durationMinutes: number
  /**
   * How many minutes before the start to be reminded.
   *
   * Only meaningful once the occurrence has a time: there is no "before" to count back from
   * when something merely happens sometime today. Zero is a legitimate value and means "at
   * the time", which is why this is optional rather than defaulting to zero.
   */
  readonly reminderMinutesBefore?: number
}

export interface PlanInstanceDraft {
  readonly id: Identifier
  readonly habitId: Identifier
  readonly date: CalendarDate
  readonly period: FrequencyPeriod
  readonly durationMinutes?: number
}

export function planInstance(draft: PlanInstanceDraft): PlannedInstance {
  return {
    id: draft.id,
    habitId: draft.habitId,
    date: draft.date,
    periodKey: periodKeyFor(draft.period, draft.date),
    durationMinutes: assertDuration(draft.durationMinutes ?? DEFAULT_INSTANCE_DURATION_MINUTES),
  }
}

export function isScheduled(instance: PlannedInstance): boolean {
  return instance.startsAt !== undefined
}

/** Pins the occurrence to a time of day. This is the drop on the day timeline. */
export function scheduleAt(instance: PlannedInstance, startsAt: TimeOfDay): PlannedInstance {
  return { ...instance, startsAt }
}

/**
 * Returns the occurrence to "sometime that day" without moving it off the day.
 *
 * The reminder goes with the time, because a reminder counts back from a start that no
 * longer exists.
 */
export function unschedule(instance: PlannedInstance): PlannedInstance {
  const { startsAt: _discardedTime, reminderMinutesBefore: _discardedReminder, ...rest } = instance

  return rest
}

/**
 * Moves the occurrence to another day, restamping the period it counts against.
 *
 * The assigned time is deliberately dropped. A slot chosen against one day's block time is
 * not a considered choice for a different day, and silently carrying it over would drop the
 * occurrence into the middle of whatever happens to sit there.
 */
export function moveToDate(
  instance: PlannedInstance,
  date: CalendarDate,
  period: FrequencyPeriod,
): PlannedInstance {
  return unschedule({ ...instance, date, periodKey: periodKeyFor(period, date) })
}

export function resize(instance: PlannedInstance, durationMinutes: number): PlannedInstance {
  return { ...instance, durationMinutes: assertDuration(durationMinutes) }
}

/** The span the occurrence occupies on the timeline, or nothing while it has no time. */
export function spanOf(instance: PlannedInstance): TimeInterval | undefined {
  if (instance.startsAt === undefined) return undefined

  return interval(instance.startsAt, instance.durationMinutes)
}

/** The lead times offered, in minutes. Zero means at the time itself. */
export const REMINDER_LEAD_TIMES: readonly number[] = [0, 5, 10, 15, 30, 60]

export class InvalidReminderError extends Error {
  constructor(readonly minutesBefore: number) {
    super(`A reminder must be a whole number of minutes, from 0 to ${MINUTES_PER_DAY}.`)
    this.name = 'InvalidReminderError'
  }
}

/**
 * Attaches a reminder to an occurrence that has a time.
 *
 * Refused on an unscheduled occurrence rather than silently ignored, because a reminder
 * that quietly does nothing is worse than one you were told you could not set.
 */
export function remindBefore(instance: PlannedInstance, minutesBefore: number): PlannedInstance {
  if (instance.startsAt === undefined) {
    throw new InvalidReminderError(minutesBefore)
  }

  if (!Number.isInteger(minutesBefore) || minutesBefore < 0 || minutesBefore > MINUTES_PER_DAY) {
    throw new InvalidReminderError(minutesBefore)
  }

  return { ...instance, reminderMinutesBefore: minutesBefore }
}

export function withoutReminder(instance: PlannedInstance): PlannedInstance {
  const { reminderMinutesBefore: _cleared, ...rest } = instance

  return rest
}

export function hasReminder(instance: PlannedInstance): boolean {
  return instance.reminderMinutesBefore !== undefined && instance.startsAt !== undefined
}

/**
 * When the reminder falls, as minutes from the start of the occurrence's own day.
 *
 * Deliberately allowed to go negative, which means the reminder belongs to the previous
 * day: an hour before a 00:30 start is 23:30 the night before. Folding that onto the clock
 * would produce 23:30 of the same day and fire seventeen hours late, so whatever schedules
 * these has to see the negative rather than be handed a tidy lie.
 */
export function reminderOffsetMinutes(instance: PlannedInstance): number | undefined {
  if (instance.startsAt === undefined || instance.reminderMinutesBefore === undefined) {
    return undefined
  }

  return instance.startsAt - instance.reminderMinutesBefore
}

export function countPlacedIn(instances: readonly PlannedInstance[], periodKey: string): number {
  return instances.filter((instance) => instance.periodKey === periodKey).length
}

/**
 * How many occurrences of a habit still need a day in the current period.
 *
 * Clamped at zero because over-placing is allowed — you may decide to run four times in a
 * three-run week — and a backlog of minus one is not a thing anyone needs to see.
 */
export function remainingPlacements(value: Frequency, placed: number): number {
  return Math.max(0, value.repetitions - placed)
}
