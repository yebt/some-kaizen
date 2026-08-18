/**
 * A calendar day with no time and no time zone attached, serialised as `YYYY-MM-DD`.
 *
 * Habit tracking is anchored to the day the user experienced, not to an instant on a
 * global timeline: "did I drink my water on Tuesday" must stay Tuesday whether it was
 * logged at 07:00 or at 23:59, and must survive a daylight saving transition. Storing a
 * `Date` would silently re-anchor those answers to UTC, so every date in the domain is
 * this brand instead, and all arithmetic runs through UTC internally where days are
 * always exactly 24 hours long.
 */
export type CalendarDate = string & { readonly __brand: unique symbol }

/** Day of the week, numbered ISO style: Monday is 1 and Sunday is 7. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const MILLISECONDS_PER_DAY = 86_400_000

export class InvalidCalendarDateError extends Error {
  constructor(readonly value: string) {
    super(`"${value}" is not a valid calendar date, expected the format YYYY-MM-DD.`)
    this.name = 'InvalidCalendarDateError'
  }
}

export class InvalidWeekdaysError extends Error {
  constructor(readonly weekdays: readonly number[]) {
    super('Pick at least one weekday, each between 1 and 7 and listed once.')
    this.name = 'InvalidWeekdaysError'
  }
}

export class InvalidDayOffsetError extends Error {
  constructor(readonly amount: number) {
    super(`A day offset must be a whole number of days, received ${amount}.`)
    this.name = 'InvalidDayOffsetError'
  }
}

/** Parses and validates an ISO day string, rejecting impossible dates such as 2026-02-30. */
export function calendarDate(value: string): CalendarDate {
  const match = ISO_DATE_PATTERN.exec(value)

  if (!match) throw new InvalidCalendarDateError(value)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day))

  const isRealDate =
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day

  if (!isRealDate) throw new InvalidCalendarDateError(value)

  return value as CalendarDate
}

/** Reads the local calendar fields of a `Date`, ignoring its UTC representation. */
export function fromDate(date: Date): CalendarDate {
  const year = String(date.getFullYear()).padStart(4, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}` as CalendarDate
}

/** The calendar date the given clock reading falls on. Inject the clock to keep callers testable. */
export function todayIn(now: Date = new Date()): CalendarDate {
  return fromDate(now)
}

/** Materialises the calendar date as local midnight, for formatting and native calendar APIs. */
export function toDate(date: CalendarDate): Date {
  const [year, month, day] = splitParts(date)

  return new Date(year, month - 1, day)
}

/**
 * Steps forward or backward by whole days.
 *
 * The offset is validated because an unchecked one poisons the brand rather than failing:
 * `Date.UTC(y, m, NaN)` is `NaN`, whose UTC accessors are all `NaN`, which formats to the
 * string `"NaN-NaN-NaN"` and would then be handed back as a `CalendarDate`. That value
 * satisfies the type while satisfying nothing else, and it would travel undetected through
 * every streak and range calculation downstream.
 */
export function addDays(date: CalendarDate, amount: number): CalendarDate {
  if (!Number.isSafeInteger(amount)) throw new InvalidDayOffsetError(amount)

  const [year, month, day] = splitParts(date)

  return fromUtcTimestamp(Date.UTC(year, month - 1, day + amount))
}

/** Whole days from `other` to `date`; positive when `date` is the later of the two. */
export function differenceInDays(date: CalendarDate, other: CalendarDate): number {
  return Math.round((utcTimestampOf(date) - utcTimestampOf(other)) / MILLISECONDS_PER_DAY)
}

/** Comparator producing chronological order, ready to hand to `Array.prototype.sort`. */
export function compareDates(date: CalendarDate, other: CalendarDate): number {
  return date < other ? -1 : date > other ? 1 : 0
}

export function isBefore(date: CalendarDate, other: CalendarDate): boolean {
  return compareDates(date, other) < 0
}

export function isAfter(date: CalendarDate, other: CalendarDate): boolean {
  return compareDates(date, other) > 0
}

/**
 * A set of weekdays, sorted and checked.
 *
 * Shared rather than written once per feature, because two copies of the same three checks
 * drift: one of them eventually accepts a Sunday numbered zero, and the bug surfaces
 * somewhere neither copy is being read.
 *
 * Sorted so that the same set ticked in a different order is the same stored value, which
 * is what lets a merge compare two devices' habits without inventing a conflict.
 */
export function weekdaySet(days: readonly number[]): Weekday[] {
  const isValid = days.every((day) => Number.isSafeInteger(day) && day >= 1 && day <= 7)
  const isUnique = new Set(days).size === days.length

  if (days.length === 0 || !isValid || !isUnique) throw new InvalidWeekdaysError(days)

  return [...days].sort((left, right) => left - right) as Weekday[]
}

export function weekday(date: CalendarDate): Weekday {
  const day = new Date(utcTimestampOf(date)).getUTCDay()

  // getUTCDay puts Sunday at 0; ISO numbering puts it at 7.
  return (day === 0 ? 7 : day) as Weekday
}

export function startOfWeek(date: CalendarDate, weekStartsOn: Weekday = 1): CalendarDate {
  const offset = (weekday(date) - weekStartsOn + 7) % 7

  return addDays(date, -offset)
}

export function endOfWeek(date: CalendarDate, weekStartsOn: Weekday = 1): CalendarDate {
  return addDays(startOfWeek(date, weekStartsOn), 6)
}

export function startOfMonth(date: CalendarDate): CalendarDate {
  const [year, month] = splitParts(date)

  return fromUtcTimestamp(Date.UTC(year, month - 1, 1))
}

export function endOfMonth(date: CalendarDate): CalendarDate {
  const [year, month] = splitParts(date)

  // Day zero of the following month is the last day of this one.
  return fromUtcTimestamp(Date.UTC(year, month, 0))
}

export function startOfYear(date: CalendarDate): CalendarDate {
  return fromUtcTimestamp(Date.UTC(splitParts(date)[0], 0, 1))
}

export function endOfYear(date: CalendarDate): CalendarDate {
  return fromUtcTimestamp(Date.UTC(splitParts(date)[0], 11, 31))
}

/**
 * ISO 8601 week key such as `2026-W11`, sortable as a plain string.
 *
 * The year in the key is the ISO week-numbering year, which is not always the calendar
 * year: 2027-01-01 belongs to `2026-W53`. Grouping weekly habit instances by calendar
 * year would split that week in half and corrupt the streak, hence the extra care here.
 */
export function isoWeekKey(date: CalendarDate): string {
  const thursday = new Date(thursdayOfWeekTimestamp(date))
  const isoYear = thursday.getUTCFullYear()
  // January 4th is the ISO 8601 anchor: it is the one date guaranteed to fall in week 1 of
  // its own numbering year, so the Thursday of its week is always week 1's Thursday.
  const firstThursday = new Date(thursdayOfWeekTimestamp(fromUtcTimestamp(Date.UTC(isoYear, 0, 4))))
  const week =
    1 + Math.round((thursday.getTime() - firstThursday.getTime()) / (7 * MILLISECONDS_PER_DAY))

  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/** Month key such as `2026-03`, sortable as a plain string. */
export function monthKey(date: CalendarDate): string {
  return date.slice(0, 7)
}

/** Year key such as `2026`, sortable as a plain string. */
export function yearKey(date: CalendarDate): string {
  return date.slice(0, 4)
}

/** Every date from `start` to `end` inclusive, in chronological order. */
export function eachDayBetween(start: CalendarDate, end: CalendarDate): CalendarDate[] {
  const span = differenceInDays(end, start)

  if (span < 0) return []

  return Array.from({ length: span + 1 }, (_, offset) => addDays(start, offset))
}

function splitParts(date: CalendarDate): [number, number, number] {
  return [Number(date.slice(0, 4)), Number(date.slice(5, 7)), Number(date.slice(8, 10))]
}

function utcTimestampOf(date: CalendarDate): number {
  const [year, month, day] = splitParts(date)

  return Date.UTC(year, month - 1, day)
}

function fromUtcTimestamp(timestamp: number): CalendarDate {
  const date = new Date(timestamp)
  const year = String(date.getUTCFullYear()).padStart(4, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')

  return `${year}-${month}-${day}` as CalendarDate
}

function thursdayOfWeekTimestamp(date: CalendarDate): number {
  const mondayBasedIndex = weekday(date) - 1

  return utcTimestampOf(date) + (3 - mondayBasedIndex) * MILLISECONDS_PER_DAY
}
