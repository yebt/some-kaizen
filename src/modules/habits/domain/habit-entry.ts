import {
  addDays,
  type CalendarDate,
  eachDayBetween,
  isAfter,
  isBefore,
} from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'

import {
  type CompletedHabit,
  type MeasuredHabit,
  type NegativeHabit,
  type NegativeOutcome,
  outcomeFor,
  type PositiveOutcome,
} from './habit'

/** What actually happened on a day, as opposed to what was planned for it. */
export interface PositiveEntry {
  readonly kind: 'positive'
  readonly id: Identifier
  readonly habitId: Identifier
  readonly date: CalendarDate
  readonly outcome: PositiveOutcome
  /** The raw quantity for a measured habit, kept so statistics can show amounts. */
  readonly value?: number
}

/**
 * A negative habit's verdict on a finished day.
 *
 * `recordedOn` is kept separate from `date` because the two genuinely differ: the day is
 * judged the morning after, and a day judged a week late is still a judgement about that
 * day, not about the day it was entered.
 */
export interface NegativeEntry {
  readonly kind: 'negative'
  readonly id: Identifier
  readonly habitId: Identifier
  readonly date: CalendarDate
  readonly outcome: NegativeOutcome
  readonly recordedOn: CalendarDate
}

export type HabitEntry = PositiveEntry | NegativeEntry

export class EntryTooEarlyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EntryTooEarlyError'
  }
}

export function recordCompleted(
  id: Identifier,
  habit: CompletedHabit,
  date: CalendarDate,
  done: boolean,
): PositiveEntry {
  assertNotBeforeCreation(habit.createdOn, date)

  return { kind: 'positive', id, habitId: habit.id, date, outcome: done ? 'done' : 'missed' }
}

export function recordMeasured(
  id: Identifier,
  habit: MeasuredHabit,
  date: CalendarDate,
  value: number,
): PositiveEntry {
  assertNotBeforeCreation(habit.createdOn, date)

  return {
    kind: 'positive',
    id,
    habitId: habit.id,
    date,
    outcome: outcomeFor(habit.measure, value),
    value,
  }
}

/**
 * Judges a finished day for a negative habit.
 *
 * The verdict cannot be given on the day itself: whether you avoided something is only
 * known once the day is over, which is why negative habits are marked the following
 * morning. Judging late is fine — the verdict still belongs to the day it describes.
 */
export function recordNegative(
  id: Identifier,
  habit: NegativeHabit,
  date: CalendarDate,
  outcome: NegativeOutcome,
  recordedOn: CalendarDate,
): NegativeEntry {
  assertNotBeforeCreation(habit.createdOn, date)

  if (!isAfter(recordedOn, date)) {
    throw new EntryTooEarlyError(
      `A negative habit is judged after the day is over; ${date} cannot be judged on ${recordedOn}.`,
    )
  }

  return { kind: 'negative', id, habitId: habit.id, date, outcome, recordedOn }
}

/**
 * The finished days still waiting for a verdict.
 *
 * Today is never included, because today is not over. This is what feeds the "yesterday,
 * did you?" prompt on the home screen, and it deliberately keeps asking about older days
 * so a few skipped mornings do not quietly erase a week of history.
 */
export function pendingNegativeChecks(
  habit: NegativeHabit,
  entries: readonly HabitEntry[],
  today: CalendarDate,
): CalendarDate[] {
  const lastJudgeableDay = earliest(addDays(today, -1), habit.archivedOn)

  if (isBefore(lastJudgeableDay, habit.createdOn)) return []

  const answered = new Set(
    entries.filter((entry) => entry.habitId === habit.id).map((entry) => entry.date),
  )

  return eachDayBetween(habit.createdOn, lastJudgeableDay).filter((day) => !answered.has(day))
}

/** Groups entries by the day they describe, for a calendar or heatmap to read directly. */
export function entriesByDate(entries: readonly HabitEntry[]): Map<CalendarDate, HabitEntry[]> {
  const index = new Map<CalendarDate, HabitEntry[]>()

  for (const entry of entries) {
    const existing = index.get(entry.date)

    if (existing) existing.push(entry)
    else index.set(entry.date, [entry])
  }

  return index
}

/**
 * The most recent entry describing a habit on a day.
 *
 * Scanned from the end, because correcting a day appends a new entry rather than mutating
 * the old one, and the newest answer is the one that counts.
 */
export function latestEntryFor(
  entries: readonly HabitEntry[],
  habitId: Identifier,
  date: CalendarDate,
): HabitEntry | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]

    if (entry && entry.habitId === habitId && entry.date === date) return entry
  }

  return undefined
}

function assertNotBeforeCreation(createdOn: CalendarDate, date: CalendarDate): void {
  if (isBefore(date, createdOn)) {
    throw new EntryTooEarlyError(`Cannot record ${date}, before the habit was created.`)
  }
}

function earliest(date: CalendarDate, other: CalendarDate | undefined): CalendarDate {
  if (!other) return date

  return isBefore(other, date) ? other : date
}
