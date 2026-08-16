import { addDays, type CalendarDate, isBefore } from '@shared/domain/calendar-date'

/**
 * How far back a statistic is measured.
 *
 * Every number on a statistics screen is meaningless without one, and a screen with a single
 * fixed window quietly picks a side of the only argument that matters: a completion rate over
 * six months answers "am I the sort of person who does this", and the same rate over seven
 * days answers "am I doing it now". Both are worth asking and they routinely disagree, which
 * is exactly why the window has to be something you can move.
 */
export type StatWindowKey = '7d' | '30d' | '90d' | '365d' | 'all'

export interface StatWindow {
  readonly key: StatWindowKey
  readonly label: string
  /** How many days back it reaches, or nothing for the whole history. */
  readonly days?: number
}

export const STAT_WINDOWS: readonly StatWindow[] = [
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '365d', label: '1y', days: 365 },
  { key: 'all', label: 'All', days: undefined },
]

export const DEFAULT_STAT_WINDOW: StatWindowKey = '30d'

export function statWindow(key: StatWindowKey): StatWindow {
  return STAT_WINDOWS.find((window) => window.key === key) ?? STAT_WINDOWS[1]!
}

/**
 * The first day a window covers.
 *
 * `earliest` is where the history actually begins — the oldest habit's creation day. It does
 * two jobs. It is the answer for "all", which cannot be a fixed number of days. And it clamps
 * every other window, so a thirty day window on an app used for six is measured over six:
 * without that, a rate is divided by days that could not have been answered, and a new user's
 * first week reads as a failure at the moment they most need it not to.
 */
export function windowStartFrom(
  window: StatWindow,
  today: CalendarDate,
  earliest: CalendarDate,
): CalendarDate {
  if (window.days === undefined) return earliest

  const reach = addDays(today, -(window.days - 1))

  return isBefore(reach, earliest) ? earliest : reach
}
