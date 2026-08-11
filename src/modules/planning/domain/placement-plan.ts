import type { CalendarDate } from '@shared/domain/calendar-date'
import { isActiveOn, type PositiveHabit } from '@modules/habits/domain/habit'

import { periodKeyFor } from './period'
import { countPlacedIn, type PlannedInstance, remainingPlacements } from './planned-instance'

/**
 * How many occurrences of a habit still need a day among the ones on screen.
 *
 * Every frequency is handled by the same rule, which is the point of keying occurrences by
 * period. The visible days are grouped into the periods they belong to, and each period is
 * asked how far short it is. A daily habit produces one period per day and therefore counts
 * a shortfall per day; a weekly habit produces one period for the whole week.
 *
 * A week straddling two months genuinely belongs to two monthly periods, so a monthly habit
 * reports the shortfall of both rather than guessing which month the week "really" is.
 */
export function remainingPlacementsAcross(
  habit: PositiveHabit,
  instances: readonly PlannedInstance[],
  days: readonly CalendarDate[],
): number {
  const mine = instances.filter((instance) => instance.habitId === habit.id)
  const periods = new Set(
    days
      .filter((day) => isActiveOn(habit, day))
      .map((day) => periodKeyFor(habit.frequency.period, day)),
  )

  let total = 0

  for (const key of periods) {
    total += remainingPlacements(habit.frequency, countPlacedIn(mine, key))
  }

  return total
}
