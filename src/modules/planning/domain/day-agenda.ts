import type { CalendarDate } from '@shared/domain/calendar-date'
import { derivedIdentifier, type Identifier } from '@shared/domain/identifier'
import {
  type Habit,
  isActiveOn,
  isPositive,
  type PositiveHabit,
} from '@modules/habits/domain/habit'

import type { PlannedInstance } from './planned-instance'

/**
 * One thing a day owes.
 *
 * The occurrence is optional because a duty can exist before anything has been placed. A
 * daily habit is due today whether or not anyone has dragged a card onto today.
 */
export interface DayDuty {
  readonly habit: PositiveHabit
  readonly instance?: PlannedInstance
  /**
   * Which of the day's slots an unplaced duty occupies.
   *
   * Present only when there is no occurrence yet, and it is what the occurrence's identity
   * is derived from when one is finally created.
   */
  readonly slot?: number
}

/**
 * The identity of "the Nth occurrence of this habit on this day".
 *
 * Derived rather than random, because that occurrence is the same real event whichever
 * device first notices it. Two devices both ticking Tuesday's meditation while offline
 * would otherwise create two records for one event, and the day would afterwards claim the
 * habit was done twice — which no later merge can repair, since at the record level there
 * is no conflict, just two different rows.
 */
export function impliedOccurrenceId(
  habitId: Identifier,
  date: CalendarDate,
  slot: number,
): Identifier {
  return derivedIdentifier('occurrence', habitId, date, String(slot))
}

/**
 * Everything a day owes: what was placed on it, plus what is due whether placed or not.
 *
 * A daily habit needs no planning decision. Its period is the day itself, so the app already
 * knows it is due today and asking someone to drag seven cards a week onto seven days would
 * be busywork with no choice in it. Those duties therefore appear on their own.
 *
 * A weekly, monthly or yearly habit is different: which day it lands on is a real decision,
 * and the planner exists precisely to make it. Those appear here only once placed.
 */
export function dutiesFor(
  habits: readonly Habit[],
  instances: readonly PlannedInstance[],
  date: CalendarDate,
): DayDuty[] {
  const byId = new Map(habits.filter(isPositive).map((habit) => [habit.id, habit]))

  const onThisDay = instances.filter((instance) => instance.date === date)

  const placed = onThisDay.flatMap<DayDuty>((instance) => {
    const habit = byId.get(instance.habitId)

    return habit ? [{ habit, instance }] : []
  })

  const takenIds = new Set(onThisDay.map((instance) => instance.id))
  const placedPerHabit = new Map<string, number>()

  for (const duty of placed) {
    placedPerHabit.set(duty.habit.id, (placedPerHabit.get(duty.habit.id) ?? 0) + 1)
  }

  const implied = [...byId.values()]
    .filter((habit) => habit.frequency.period === 'daily' && isActiveOn(habit, date))
    .flatMap<DayDuty>((habit) => {
      const already = placedPerHabit.get(habit.id) ?? 0
      const shortfall = habit.frequency.repetitions - already

      if (shortfall <= 0) return []

      const duties: DayDuty[] = []

      // Slots whose identity is already on the day are skipped rather than reused, so
      // completing one duty does not renumber the others out from under themselves.
      for (let slot = 0; duties.length < shortfall; slot += 1) {
        if (!takenIds.has(impliedOccurrenceId(habit.id, date, slot))) {
          duties.push({ habit, slot })
        }
      }

      return duties
    })

  return [...placed, ...implied]
}
