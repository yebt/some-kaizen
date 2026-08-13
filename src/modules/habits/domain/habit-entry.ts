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

/**
 * When an entry was written, as an instant.
 *
 * A day can be answered more than once, and the newest answer is the one that counts. That
 * ordering has to be carried by the record itself: storage returns rows keyed by identifier,
 * which for a UUID is effectively random, so "the last one in the list" is not "the last one
 * written". Relying on list order made corrections win or lose by chance.
 */
export type RecordedAt = number

/** What actually happened on a day, as opposed to what was planned for it. */
export interface PositiveEntry {
  readonly kind: 'positive'
  readonly id: Identifier
  readonly habitId: Identifier
  readonly date: CalendarDate
  readonly outcome: PositiveOutcome
  /** The raw quantity for a measured habit, kept so statistics can show amounts. */
  readonly value?: number
  /**
   * The occurrence this answers, when it answers one.
   *
   * A habit can recur several times in a single day, and each of those occurrences is
   * completed separately. Keying an entry to the day alone would make three gym sessions on
   * Saturday indistinguishable from one, so a habit asking for three could never be met.
   */
  readonly instanceId?: Identifier
  /**
   * A line about the day, written by the person who lived it.
   *
   * The one thing no statistic can produce. A completion rate says a Tuesday was missed; it
   * cannot say the flight was delayed, and next February neither can you. Optional and
   * absent by default, because a tracker that asks for a paragraph every morning is a
   * tracker nobody opens twice.
   */
  readonly note?: string
  readonly recordedAt: RecordedAt
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
  readonly note?: string
  readonly recordedAt: RecordedAt
}

export type HabitEntry = PositiveEntry | NegativeEntry

export class EntryTooEarlyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EntryTooEarlyError'
  }
}

/** The optional details of a recording, grouped so the signatures stop growing positionally. */
export interface RecordOptions {
  readonly instanceId?: Identifier
  readonly note?: string
  readonly recordedAt?: RecordedAt
}

export const MAX_NOTE_LENGTH = 280

export class InvalidNoteError extends Error {
  constructor() {
    super(`A note can be at most ${MAX_NOTE_LENGTH} characters.`)
    this.name = 'InvalidNoteError'
  }
}

/**
 * Trims a note, and treats one that is only whitespace as no note at all.
 *
 * An empty string and an absent field would otherwise mean the same thing while comparing as
 * different, which is exactly the kind of difference a merge reports as a conflict nobody
 * caused.
 */
export function readNote(note: string | undefined): string | undefined {
  if (note === undefined) return undefined

  const trimmed = note.trim()

  if (trimmed.length > MAX_NOTE_LENGTH) throw new InvalidNoteError()

  return trimmed === '' ? undefined : trimmed
}

export function recordCompleted(
  id: Identifier,
  habit: CompletedHabit,
  date: CalendarDate,
  done: boolean,
  options: RecordOptions = {},
): PositiveEntry {
  assertNotBeforeCreation(habit.createdOn, date)

  return {
    kind: 'positive',
    id,
    habitId: habit.id,
    date,
    outcome: done ? 'done' : 'missed',
    instanceId: options.instanceId,
    note: readNote(options.note),
    recordedAt: options.recordedAt ?? Date.now(),
  }
}

export function recordMeasured(
  id: Identifier,
  habit: MeasuredHabit,
  date: CalendarDate,
  value: number,
  options: RecordOptions = {},
): PositiveEntry {
  assertNotBeforeCreation(habit.createdOn, date)

  return {
    kind: 'positive',
    id,
    habitId: habit.id,
    date,
    outcome: outcomeFor(habit.measure, value),
    value,
    instanceId: options.instanceId,
    note: readNote(options.note),
    recordedAt: options.recordedAt ?? Date.now(),
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
  options: RecordOptions = {},
): NegativeEntry {
  assertNotBeforeCreation(habit.createdOn, date)

  if (!isAfter(recordedOn, date)) {
    throw new EntryTooEarlyError(
      `A negative habit is judged after the day is over; ${date} cannot be judged on ${recordedOn}.`,
    )
  }

  return {
    kind: 'negative',
    id,
    habitId: habit.id,
    date,
    note: readNote(options.note),
    outcome,
    recordedOn,
    recordedAt: options.recordedAt ?? Date.now(),
  }
}

/**
 * Groups entries by what they answer, keeping only the newest verdict for each.
 *
 * An entry tied to an occurrence answers that occurrence; one without is a plain answer for
 * the day. This is the single place that decides "which record still counts", so statistics
 * and screens cannot disagree about whether a correction took effect.
 */
export function currentEntries(entries: readonly HabitEntry[]): HabitEntry[] {
  const latest = new Map<string, HabitEntry>()

  for (const entry of entries) {
    const subject = entry.kind === 'positive' && entry.instanceId ? entry.instanceId : entry.date
    const key = `${entry.habitId}:${subject}`
    const existing = latest.get(key)

    if (!existing || entry.recordedAt >= existing.recordedAt) latest.set(key, entry)
  }

  return [...latest.values()]
}

/** The verdict that currently stands for one occurrence. */
export function latestEntryForInstance(
  entries: readonly HabitEntry[],
  instanceId: Identifier,
): PositiveEntry | undefined {
  let latest: PositiveEntry | undefined

  for (const entry of entries) {
    if (entry.kind !== 'positive' || entry.instanceId !== instanceId) continue

    if (!latest || entry.recordedAt >= latest.recordedAt) latest = entry
  }

  return latest
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
 * Chosen by `recordedAt` rather than by position, because correcting a day appends a new
 * entry and storage hands back rows keyed by identifier, which for a UUID is effectively
 * random order. Reading the last element of the list made a correction win or lose by
 * chance. Ties fall back to the later position, which keeps two entries written in the same
 * millisecond deterministic.
 */
export function latestEntryFor(
  entries: readonly HabitEntry[],
  habitId: Identifier,
  date: CalendarDate,
): HabitEntry | undefined {
  let latest: HabitEntry | undefined

  for (const entry of entries) {
    if (entry.habitId !== habitId || entry.date !== date) continue

    if (!latest || entry.recordedAt >= latest.recordedAt) latest = entry
  }

  return latest
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
