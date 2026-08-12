import type { CalendarDate } from '@shared/domain/calendar-date'
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
}

/**
 * Everything a day owes: what was placed on it, plus what is due whether placed or not.
 *
 * A daily habit needs no planning decision. Its period is the day itself, so the app
 * already knows it is due today and asking someone to drag seven cards a week onto seven
 * days would be busywork with no choice in it. Those duties therefore appear on their own.
 *
 * A weekly, monthly or yearly habit is different: which day it lands on is a real decision,
 * and the planner exists precisely to make it. Those appear here only once placed, which
 * is why they are dragged rather than assumed.
 */
export function dutiesFor(
  habits: readonly Habit[],
  instances: readonly PlannedInstance[],
  date: CalendarDate,
): DayDuty[] {
  const byId = new Map(habits.filter(isPositive).map((habit) => [habit.id, habit]))

  const placed = instances
    .filter((instance) => instance.date === date)
    .flatMap<DayDuty>((instance) => {
      const habit = byId.get(instance.habitId)

      return habit ? [{ habit, instance }] : []
    })

  const placedPerHabit = new Map<string, number>()

  for (const duty of placed) {
    placedPerHabit.set(duty.habit.id, (placedPerHabit.get(duty.habit.id) ?? 0) + 1)
  }

  const implied = [...byId.values()]
    .filter((habit) => habit.frequency.period === 'daily' && isActiveOn(habit, date))
    .flatMap<DayDuty>((habit) => {
      const shortfall = habit.frequency.repetitions - (placedPerHabit.get(habit.id) ?? 0)

      return Array.from({ length: Math.max(shortfall, 0) }, () => ({ habit }))
    })

  return [...placed, ...implied]
}
