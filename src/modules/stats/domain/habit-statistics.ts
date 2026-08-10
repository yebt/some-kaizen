import { addDays, type CalendarDate, eachDayBetween, isBefore } from '@shared/domain/calendar-date'
import {
  isActiveOn,
  type NegativeHabit,
  type NegativeOutcome,
  type PositiveHabit,
} from '@modules/habits/domain/habit'
import type { HabitEntry } from '@modules/habits/domain/habit-entry'
import { periodKeyFor } from '@modules/planning/domain/period'

/** How one period of a positive habit turned out. */
export interface PeriodOutcome {
  readonly key: string
  /** Repetitions the frequency asks for inside this period. */
  readonly required: number
  readonly done: number
  readonly partial: number
  readonly missed: number
  /** True once the required repetitions were completed. */
  readonly met: boolean
  /** True while the period still contains today and can therefore still be rescued. */
  readonly inProgress: boolean
}

export interface PositiveStatistics {
  readonly periods: PeriodOutcome[]
  readonly currentStreak: number
  readonly longestStreak: number
  /** Met periods over closed periods, from 0 to 1. */
  readonly completionRate: number
  readonly totalDone: number
  readonly totalPartial: number
}

export interface NegativeStatistics {
  readonly judgedDays: number
  readonly cleanDays: number
  readonly relapses: number
  readonly currentCleanStreak: number
  readonly longestCleanStreak: number
  readonly lastRelapse?: CalendarDate
  /** Clean days over judged days, from 0 to 1. */
  readonly cleanRate: number
}

/**
 * Breaks a positive habit's history into the periods its frequency is counted against.
 *
 * A twice-a-week habit is not failing on Tuesday. It fails when the week closes with fewer
 * than two done, which is why nothing here is measured per day. Periods with no entries at
 * all are still listed, because a week you never touched is a missed week and leaving it
 * out would silently repair the streak that runs through it.
 */
export function periodOutcomes(
  habit: PositiveHabit,
  entries: readonly HabitEntry[],
  from: CalendarDate,
  to: CalendarDate,
  today: CalendarDate,
): PeriodOutcome[] {
  const period = habit.frequency.period
  const activeDays = eachDayBetween(from, to).filter((day) => isActiveOn(habit, day))
  const activeDaySet = new Set(activeDays)
  const currentKey = periodKeyFor(period, today)

  const tallies = new Map<string, { done: number; partial: number; missed: number }>()

  for (const day of activeDays) {
    const key = periodKeyFor(period, day)

    if (!tallies.has(key)) tallies.set(key, { done: 0, partial: 0, missed: 0 })
  }

  for (const entry of entries) {
    if (entry.habitId !== habit.id || entry.kind !== 'positive') continue
    if (!activeDaySet.has(entry.date)) continue

    const tally = tallies.get(periodKeyFor(period, entry.date))

    if (!tally) continue

    if (entry.outcome === 'done') tally.done += 1
    else if (entry.outcome === 'partial') tally.partial += 1
    else tally.missed += 1
  }

  return [...tallies.entries()].map(([key, tally]) => ({
    key,
    required: habit.frequency.repetitions,
    done: tally.done,
    partial: tally.partial,
    missed: tally.missed,
    met: tally.done >= habit.frequency.repetitions,
    inProgress: key === currentKey,
  }))
}

export function positiveStatistics(
  habit: PositiveHabit,
  entries: readonly HabitEntry[],
  from: CalendarDate,
  to: CalendarDate,
  today: CalendarDate,
): PositiveStatistics {
  const periods = periodOutcomes(habit, entries, from, to, today)
  const closed = periods.filter((period) => !period.inProgress)

  return {
    periods,
    currentStreak: currentStreakOf(periods),
    longestStreak: longestStreakOf(periods),
    completionRate: closed.length === 0 ? 0 : closed.filter((p) => p.met).length / closed.length,
    totalDone: periods.reduce((total, period) => total + period.done, 0),
    totalPartial: periods.reduce((total, period) => total + period.partial, 0),
  }
}

/**
 * Counts back from the most recent period that could actually have failed.
 *
 * The period containing today is skipped when it is not yet met, because it has not failed
 * — there is still time. Punishing a half-finished week would make the number drop every
 * Monday morning and mean nothing.
 */
function currentStreakOf(periods: readonly PeriodOutcome[]): number {
  let index = periods.length - 1
  const last = periods[index]

  if (last && last.inProgress && !last.met) index -= 1

  let streak = 0

  for (; index >= 0; index -= 1) {
    const period = periods[index]

    if (!period?.met) break

    streak += 1
  }

  return streak
}

function longestStreakOf(periods: readonly PeriodOutcome[]): number {
  let longest = 0
  let running = 0

  for (const period of periods) {
    running = period.met ? running + 1 : 0
    longest = Math.max(longest, running)
  }

  return longest
}

/**
 * Summarises a negative habit over every day that has already been judged.
 *
 * Today is never counted, because a negative habit is only marked once the day is over.
 * Days that were never answered are excluded from the totals rather than assumed clean, and
 * the current streak stops when it reaches one: claiming a run through days you never
 * confirmed would be flattering rather than true.
 */
export function negativeStatistics(
  habit: NegativeHabit,
  entries: readonly HabitEntry[],
  today: CalendarDate,
): NegativeStatistics {
  const lastJudgeableDay = earliestOf(addDays(today, -1), habit.archivedOn)

  if (isBefore(lastJudgeableDay, habit.createdOn)) {
    return {
      judgedDays: 0,
      cleanDays: 0,
      relapses: 0,
      currentCleanStreak: 0,
      longestCleanStreak: 0,
      cleanRate: 0,
    }
  }

  const verdicts = verdictsByDay(habit, entries)
  const days = eachDayBetween(habit.createdOn, lastJudgeableDay)

  let cleanDays = 0
  let relapses = 0
  let longest = 0
  let running = 0
  let lastRelapse: CalendarDate | undefined

  for (const day of days) {
    const verdict = verdicts.get(day)

    if (verdict === 'avoided') {
      cleanDays += 1
      running += 1
      longest = Math.max(longest, running)
      continue
    }

    running = 0

    if (verdict === 'relapsed') {
      relapses += 1
      lastRelapse = day
    }
  }

  let currentCleanStreak = 0

  for (let index = days.length - 1; index >= 0; index -= 1) {
    const day = days[index]

    if (!day || verdicts.get(day) !== 'avoided') break

    currentCleanStreak += 1
  }

  const judgedDays = cleanDays + relapses

  return {
    judgedDays,
    cleanDays,
    relapses,
    currentCleanStreak,
    longestCleanStreak: longest,
    lastRelapse,
    cleanRate: judgedDays === 0 ? 0 : cleanDays / judgedDays,
  }
}

/** The latest verdict per day, so a corrected answer supersedes the original. */
function verdictsByDay(
  habit: NegativeHabit,
  entries: readonly HabitEntry[],
): Map<CalendarDate, NegativeOutcome> {
  const verdicts = new Map<CalendarDate, NegativeOutcome>()

  for (const entry of entries) {
    if (entry.habitId !== habit.id || entry.kind !== 'negative') continue

    verdicts.set(entry.date, entry.outcome)
  }

  return verdicts
}

function earliestOf(date: CalendarDate, other: CalendarDate | undefined): CalendarDate {
  if (!other) return date

  return isBefore(other, date) ? other : date
}
