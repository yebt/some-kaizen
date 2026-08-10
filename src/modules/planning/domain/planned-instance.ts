import type { CalendarDate } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import {
  assertDuration,
  interval,
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

/** Returns the occurrence to "sometime that day" without moving it off the day. */
export function unschedule(instance: PlannedInstance): PlannedInstance {
  const { startsAt: _discarded, ...rest } = instance

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
