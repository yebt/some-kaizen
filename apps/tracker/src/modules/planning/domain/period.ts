import {
  type CalendarDate,
  endOfMonth,
  endOfWeek,
  endOfYear,
  isoWeekKey,
  monthKey,
  startOfMonth,
  startOfWeek,
  startOfYear,
  yearKey,
} from '@shared/domain/calendar-date'
import type { FrequencyPeriod } from '@modules/habits/domain/habit'

/**
 * The window a habit's repetitions are counted against.
 *
 * "Twice a week" only means something once you fix which week, so every planned instance
 * is stamped with the key of the period it belongs to. Counting placements by key rather
 * than by scanning dates is what keeps the quota correct when a week straddles a month or
 * a year boundary.
 */
export interface PeriodRange {
  readonly start: CalendarDate
  readonly end: CalendarDate
}

/**
 * A sortable string identifying the period a day falls in.
 *
 * Weeks use ISO 8601 numbering, so a week is Monday to Sunday and the week spanning new
 * year keeps a single key instead of splitting into two half quotas.
 */
export function periodKeyFor(period: FrequencyPeriod, date: CalendarDate): string {
  switch (period) {
    case 'daily':
      return date
    case 'weekly':
      return isoWeekKey(date)
    case 'monthly':
      return monthKey(date)
    case 'yearly':
      return yearKey(date)
  }
}

export function periodRangeFor(period: FrequencyPeriod, date: CalendarDate): PeriodRange {
  switch (period) {
    case 'daily':
      return { start: date, end: date }
    case 'weekly':
      return { start: startOfWeek(date), end: endOfWeek(date) }
    case 'monthly':
      return { start: startOfMonth(date), end: endOfMonth(date) }
    case 'yearly':
      return { start: startOfYear(date), end: endOfYear(date) }
  }
}

/** Whether the day belongs to the period the key names. */
export function periodContains(period: FrequencyPeriod, key: string, date: CalendarDate): boolean {
  return periodKeyFor(period, date) === key
}
