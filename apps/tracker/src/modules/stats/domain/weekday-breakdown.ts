import {
  type CalendarDate,
  eachDayBetween,
  weekday,
  type Weekday,
} from '@shared/domain/calendar-date'
import { type Habit, isActiveOn, isNegative, namesItsDays } from '@modules/habits/domain/habit'
import { currentEntries, type HabitEntry } from '@modules/habits/domain/habit-entry'

/**
 * How a habit goes on each day of the week.
 *
 * The most actionable number a tracker can produce, and one this app already stores
 * everything for. A streak tells you how long you have kept something up; it does not tell
 * you what to change. "Your worst day is Tuesday, 41%" does — you look at your Tuesdays and
 * find the six o'clock meeting.
 *
 * Measured over days that were actually answered rather than over every day in the window.
 * Counting unanswered days as failures would make a fortnight away from the app read as a
 * collapse in discipline, and the number nobody believes is the number nobody acts on.
 */
export interface WeekdayRate {
  readonly weekday: Weekday
  /** Days of this weekday that carry a verdict, which is the denominator. */
  readonly answered: number
  /** Of those, the ones that went well: done for a positive habit, avoided for a negative. */
  readonly kept: number
  /** `kept / answered`, from 0 to 1, or undefined when nothing has been answered yet. */
  readonly rate?: number
}

/** How many answered days a weekday needs before its rate is worth reading. */
export const MINIMUM_ANSWERED_DAYS = 2

export interface WeekdayBreakdown {
  readonly days: readonly WeekdayRate[]
  /**
   * The best and worst weekday, when there is enough answered to mean anything.
   *
   * Both absent rather than guessed. One good Tuesday is not a pattern, and a screen that
   * announces "best day: Tuesday, 100%" off a single answer is teaching someone to trust a
   * number that will move the moment they answer again.
   */
  readonly best?: WeekdayRate
  readonly worst?: WeekdayRate
}

const EVERY_WEEKDAY: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]

/**
 * Whether a day is one this habit could have been kept on at all.
 *
 * A habit that names Monday, Wednesday and Friday has no opinion about Sunday, so counting
 * Sundays against it would invent a 0% that describes the schedule rather than the person.
 */
function couldBeKeptOn(habit: Habit, date: CalendarDate): boolean {
  if (!isActiveOn(habit, date)) return false
  if (isNegative(habit)) return true

  return !namesItsDays(habit.frequency) || habit.frequency.weekdays.includes(weekday(date))
}

export function weekdayBreakdown(
  habit: Habit,
  entries: readonly HabitEntry[],
  from: CalendarDate,
  to: CalendarDate,
): WeekdayBreakdown {
  const eligible = new Set(eachDayBetween(from, to).filter((date) => couldBeKeptOn(habit, date)))

  const answered = new Map<Weekday, { answered: number; kept: number }>()
  const seen = new Set<CalendarDate>()

  for (const weekdayNumber of EVERY_WEEKDAY) {
    answered.set(weekdayNumber, { answered: 0, kept: 0 })
  }

  for (const entry of currentEntries(entries)) {
    if (entry.habitId !== habit.id) continue
    if (!eligible.has(entry.date)) continue

    /*
     * One vote per day, not per entry.
     *
     * A habit due three times a day writes three entries, and counting each of them would let
     * one busy Wednesday outweigh a whole month of Mondays. The day is the unit here because
     * the question is "how do my Wednesdays go", not "how many things happened".
     */
    if (seen.has(entry.date)) continue

    seen.add(entry.date)

    const tally = answered.get(weekday(entry.date))

    if (!tally) continue

    tally.answered += 1

    const kept = entry.kind === 'negative' ? entry.outcome === 'avoided' : entry.outcome === 'done'

    if (kept) tally.kept += 1
  }

  const days = EVERY_WEEKDAY.map<WeekdayRate>((weekdayNumber) => {
    const tally = answered.get(weekdayNumber) ?? { answered: 0, kept: 0 }

    return {
      weekday: weekdayNumber,
      answered: tally.answered,
      kept: tally.kept,
      ...(tally.answered === 0 ? {} : { rate: tally.kept / tally.answered }),
    }
  })

  const readable = days.filter((day) => day.answered >= MINIMUM_ANSWERED_DAYS)

  // Fewer than two readable weekdays and "best" and "worst" would be the same day wearing two
  // labels, which reads as a finding and is arithmetic.
  if (readable.length < 2) return { days }

  const sorted = [...readable].sort((left, right) => (right.rate ?? 0) - (left.rate ?? 0))
  const best = sorted[0]
  const worst = sorted.at(-1)

  // A flat week has no best and no worst. Naming two ends of a range that does not exist
  // invents a pattern out of noise.
  if (!best || !worst || best.rate === worst.rate) return { days }

  return { days, best, worst }
}
