import type { CalendarDate } from '@shared/domain/calendar-date'
import { isActiveOn, namesItsDays, type PositiveHabit } from '@modules/habits/domain/habit'

import { periodKeyFor } from './period'
import { countPlacedIn, type PlannedInstance, remainingPlacements } from './planned-instance'

/**
 * Whether which day this habit falls on is a decision anyone still has to make.
 *
 * The planner is a screen for exactly one question, and this is the question. A daily habit
 * has no answer to give — its period is the day itself, so it is due today whatever anyone
 * drags — and a habit that named its weekdays answered it when it was created. Both were
 * already excluded from the day's agenda for those reasons; without this they still turned
 * up in the planner's tray asking to be placed, which is the same busywork wearing a hat.
 *
 * What is left is the genuinely open case: three times a week, once a month. The app cannot
 * know which days those are, and nobody else can either.
 */
export function needsPlacing(habit: PositiveHabit): boolean {
  return habit.frequency.period !== 'daily' && !namesItsDays(habit.frequency)
}

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
