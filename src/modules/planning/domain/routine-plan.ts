import type { CalendarDate } from '@shared/domain/calendar-date'
import { assertDuration, MINUTES_PER_DAY, type TimeOfDay } from '@shared/domain/time-of-day'
import { type Habit, isPositive, type PositiveHabit } from '@modules/habits/domain/habit'
import type { Routine } from '@modules/habits/domain/routine'

import { impliedOccurrenceId } from './day-agenda'
import {
  DEFAULT_INSTANCE_DURATION_MINUTES,
  type PlannedInstance,
  planInstance,
  scheduleAt,
} from './planned-instance'

/**
 * Filling a day by saying how long each thing takes, instead of by placing each thing.
 *
 * This is the third way to fill a day, next to dragging a card onto an hour and typing an
 * exact time — and for a morning it is by far the fastest of the three, because a morning is
 * not a set of independent appointments. It is one sequence: you get up, and then each thing
 * starts when the last one finished. Stating the wake time and six durations answers six
 * questions at once, and changing the first one re-answers all of them.
 *
 * Nothing here is a new kind of record. A build produces ordinary occurrences, the same ones
 * a drag produces, so every screen downstream already knows what to do with them.
 */

/** One thing in the sequence, and how long it is expected to take. */
export interface RoutineStep {
  readonly habit: PositiveHabit
  readonly durationMinutes: number
}

/** A step once the clock has been counted forward to it. */
export interface ScheduledStep extends RoutineStep {
  readonly startsAt: TimeOfDay
}

export interface RoutineCascade {
  /** The steps that land on the day, in order. */
  readonly steps: readonly ScheduledStep[]
  /**
   * The steps that would have begun on the following day, kept out of the plan and named.
   *
   * Folding them back onto the clock is the tempting alternative and the wrong one: a step
   * running to 00:30 would be drawn at the very top of the same day, hours *before* the step
   * it follows. Better to say plainly that the routine does not fit than to place it
   * somewhere it visibly does not belong.
   */
  readonly overflow: readonly RoutineStep[]
  /** Where the steps that fit finish, which is the number people actually check. */
  readonly endsAt: TimeOfDay
}

/**
 * The sequence a routine describes, ready to be cascaded.
 *
 * Habits that no longer exist are skipped rather than represented by a gap, for the same
 * reason the routine list counts only the ones it can still name: a screen that claims six
 * steps and shows five is a screen you stop believing.
 */
export function stepsFor(routine: Routine, habits: readonly Habit[]): RoutineStep[] {
  const byId = new Map(habits.map((habit) => [habit.id, habit]))

  return routine.habitIds.flatMap<RoutineStep>((habitId) => {
    const habit = byId.get(habitId)

    // A habit you are quitting is never performed, so it is never a step in a sequence.
    if (!habit || !isPositive(habit)) return []

    return [
      {
        habit,
        durationMinutes: habit.usualDurationMinutes ?? DEFAULT_INSTANCE_DURATION_MINUTES,
      },
    ]
  })
}

/**
 * Counts the clock forward through the steps, each starting where the last one ended.
 *
 * Only the *start* has to belong to the day. A step that begins at 23:30 and lasts an hour is
 * perfectly ordinary — sleep is exactly that — and an occurrence has always been able to span
 * midnight. A step that would *begin* at or after midnight belongs to a different day, and
 * this is not the function that gets to move it there.
 */
export function cascadeFrom(start: TimeOfDay, steps: readonly RoutineStep[]): RoutineCascade {
  const scheduled: ScheduledStep[] = []
  const overflow: RoutineStep[] = []
  let cursor: number = start

  for (const step of steps) {
    const durationMinutes = assertDuration(step.durationMinutes)

    // Once the cursor has run off the end of the day it stays there, because a sequence only
    // ever moves forward. So this one comparison also holds back every step that follows.
    if (cursor >= MINUTES_PER_DAY) {
      overflow.push(step)
      continue
    }

    scheduled.push({ ...step, durationMinutes, startsAt: cursor as TimeOfDay })
    cursor += durationMinutes
  }

  return {
    steps: scheduled,
    overflow,
    // Folded onto the clock, because an end time is read as a wall clock time: a routine
    // finishing at half past midnight reads as 00:30, and always has on this ruler.
    endsAt: (cursor % MINUTES_PER_DAY) as TimeOfDay,
  }
}

/**
 * The occurrences a build writes.
 *
 * Each carries the identity the day would have derived for it anyway. That is not a detail:
 * a random identifier here would sit on the timeline *beside* the duty the day already knew
 * about, and the day would claim the habit is owed twice.
 */
export function occurrencesFor(cascade: RoutineCascade, date: CalendarDate): PlannedInstance[] {
  return cascade.steps.map((step) =>
    scheduleAt(
      planInstance({
        id: impliedOccurrenceId(step.habit.id, date, 0),
        habitId: step.habit.id,
        date,
        period: step.habit.frequency.period,
        durationMinutes: step.durationMinutes,
      }),
      step.startsAt,
    ),
  )
}

/**
 * The occurrences a build makes obsolete, which the caller has to remove.
 *
 * Building a morning is a statement about the whole morning, so a card that was already on
 * the day for one of its habits is answered by the build rather than left beside it. Only
 * records the build does not itself overwrite are reported: the built occurrence carries the
 * derived identity, so saving it replaces that one in place, and naming it here as well would
 * have the caller delete what it had just written.
 *
 * A step that was held back supersedes nothing. It placed nothing, and removing an existing
 * plan to put nothing in its place is destruction dressed as an update.
 */
export function supersededBy(
  instances: readonly PlannedInstance[],
  cascade: RoutineCascade,
  date: CalendarDate,
): PlannedInstance[] {
  const placed = new Set(cascade.steps.map((step) => step.habit.id))
  const written = new Set(occurrencesFor(cascade, date).map((occurrence) => occurrence.id))

  return instances.filter(
    (instance) =>
      instance.date === date && placed.has(instance.habitId) && !written.has(instance.id),
  )
}
