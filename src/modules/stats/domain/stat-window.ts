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
export type StatWindowKey = '7d' | '30d' | '90d' | '365d' | 'all' | 'custom'

export interface StatWindow {
  readonly key: StatWindowKey
  readonly label: string
  /** How many days back it reaches, or nothing for the whole history. */
  readonly days?: number
  /**
   * True when both ends are chosen by hand rather than counted back from today.
   *
   * The other windows all end today, because the question they answer is "how is it going".
   * A chosen one answers a different question — "how did March go", "what happened while I
   * was ill" — and that one needs an end as well as a start, or it is not a chosen span at
   * all, just a longer default.
   */
  readonly chosen?: boolean
}

export const STAT_WINDOWS: readonly StatWindow[] = [
  { key: '7d', label: '7d', days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
  { key: '365d', label: '1y', days: 365 },
  { key: 'all', label: 'All', days: undefined },
  { key: 'custom', label: 'Pick', days: undefined, chosen: true },
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

/** The two ends of a window, once today and the history have been taken into account. */
export interface StatRange {
  readonly from: CalendarDate
  readonly to: CalendarDate
}

/**
 * The span a window actually covers.
 *
 * Both ends are clamped, and neither clamp is politeness. A start before the history begins
 * divides a rate by days nobody could have answered; an end after today does the same at the
 * other side, and a window running into next month would quietly report a falling completion
 * rate every morning it was left open.
 *
 * Ends given the wrong way round are read as the span between them rather than refused. Two
 * date fields invite it, the meaning is unambiguous, and an error message there would be the
 * app being pedantic about something it understood perfectly.
 */
export function rangeFor(
  window: StatWindow,
  today: CalendarDate,
  earliest: CalendarDate,
  chosen: { from?: CalendarDate; to?: CalendarDate } = {},
): StatRange {
  if (!window.chosen) return { from: windowStartFrom(window, today, earliest), to: today }

  const first = chosen.from ?? earliest
  const second = chosen.to ?? today
  const [from, to] = isBefore(second, first) ? [second, first] : [first, second]

  return {
    from: isBefore(from, earliest) ? earliest : from,
    to: isBefore(today, to) ? today : to,
  }
}
