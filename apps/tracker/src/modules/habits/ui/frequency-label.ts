import type { Weekday } from '@shared/domain/calendar-date'
import { type Frequency, namesItsDays } from '@modules/habits/domain/habit'

const PERIOD_NOUN = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const

/** Short enough to sit in a list row, long enough to be a word rather than a number. */
const WEEKDAY_NAME: Record<Weekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

const WORKDAYS = '1,2,3,4,5'
const WEEKEND = '6,7'

/**
 * A recurrence written the way its owner would say it out loud.
 *
 * One function rather than the same three lines on every screen that shows a habit: a
 * frequency that reads as "3 times a week" in one place and "Mon, Wed, Fri" in another is
 * the same habit apparently changing its plan depending on where you look at it.
 */
export function describeFrequency(frequency: Frequency): string {
  if (!namesItsDays(frequency)) {
    const times = frequency.repetitions === 1 ? 'Once' : `${frequency.repetitions} times`

    return `${times} a ${PERIOD_NOUN[frequency.period]}`
  }

  const days = frequency.weekdays

  // Named because that is how people say it. "Mon, Tue, Wed, Thu, Fri" is a list you have
  // to read; "Weekdays" is a thing you already know.
  if (days.length === 7) return 'Every day'

  const key = [...days].join(',')

  if (key === WORKDAYS) return 'Weekdays'
  if (key === WEEKEND) return 'Weekends'

  return days.map((day) => WEEKDAY_NAME[day]).join(', ')
}
