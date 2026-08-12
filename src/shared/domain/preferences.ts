/**
 * How the clock is written.
 *
 * Not a cosmetic detail on a planner: someone who reads 12 hour time has to translate
 * "18:30" every single time they glance at the timeline, and a tracker is glanced at
 * constantly.
 */
export type ClockFormat = '24h' | '12h'

/**
 * Which theme to use.
 *
 * `system` is the default rather than light, because a phone that switches to dark at
 * sunset should take the app with it without anyone having to remember.
 */
export type ThemeChoice = 'system' | 'light' | 'dark'

/**
 * How closely the day timeline is zoomed in.
 *
 * Not a display nicety. The scale of the ruler is also the step everything on it snaps to,
 * because a quarter hour drawn four pixels tall cannot be aimed at with a finger. Zooming in
 * is therefore how an occurrence gets a time finer than the default step, and zooming out is
 * how a whole day fits on one screen when the question is shape rather than detail.
 */
export type TimelineDetail = 'coarse' | 'normal' | 'fine'

export interface TimelineScale {
  /** How tall a minute is drawn. One is a day of 1440 honest, scrollable pixels. */
  readonly pixelsPerMinute: number
  /** The step a drag lands on. Kept in proportion, so a step is never smaller than a thumb. */
  readonly snapMinutes: number
}

export const TIMELINE_SCALES: Readonly<Record<TimelineDetail, TimelineScale>> = {
  coarse: { pixelsPerMinute: 0.5, snapMinutes: 30 },
  normal: { pixelsPerMinute: 1, snapMinutes: 15 },
  fine: { pixelsPerMinute: 2, snapMinutes: 5 },
}

/** Widest view of the day first, which is the order a zoom control walks along. */
export const TIMELINE_DETAILS: readonly TimelineDetail[] = ['coarse', 'normal', 'fine']

export interface Preferences {
  readonly clock: ClockFormat
  readonly theme: ThemeChoice
  readonly timeline: TimelineDetail
}

export const DEFAULT_PREFERENCES: Preferences = {
  clock: '24h',
  theme: 'system',
  timeline: 'normal',
}

const CLOCKS: readonly ClockFormat[] = ['24h', '12h']
const THEMES: readonly ThemeChoice[] = ['system', 'light', 'dark']

/**
 * Reads stored preferences, falling back rather than throwing.
 *
 * Preferences are not data: a corrupted or half written value should quietly become the
 * default, not stop the app from starting. That is the opposite of the rule for a backup
 * file, where a bad value must be refused loudly, and the difference is exactly that losing
 * a theme choice costs nothing while losing a year of habits costs everything.
 */
export function readPreferences(raw: unknown): Preferences {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_PREFERENCES

  const value = raw as Record<string, unknown>

  return {
    clock: CLOCKS.includes(value.clock as ClockFormat)
      ? (value.clock as ClockFormat)
      : DEFAULT_PREFERENCES.clock,
    theme: THEMES.includes(value.theme as ThemeChoice)
      ? (value.theme as ThemeChoice)
      : DEFAULT_PREFERENCES.theme,
    timeline: TIMELINE_DETAILS.includes(value.timeline as TimelineDetail)
      ? (value.timeline as TimelineDetail)
      : DEFAULT_PREFERENCES.timeline,
  }
}

export function timelineScale(preferences: Preferences): TimelineScale {
  return TIMELINE_SCALES[preferences.timeline]
}

/**
 * The next detail level in a direction, stopping at the ends rather than wrapping.
 *
 * Wrapping would send someone who taps once too often from the closest view to the widest,
 * which reads as the control having broken rather than as having run out of room.
 */
export function zoomedTimeline(preferences: Preferences, steps: number): TimelineDetail {
  const current = TIMELINE_DETAILS.indexOf(preferences.timeline)
  const next = Math.min(Math.max(current + steps, 0), TIMELINE_DETAILS.length - 1)

  return TIMELINE_DETAILS[next] ?? preferences.timeline
}

/** Whether times should be rendered on a 12 hour clock. */
export function usesHour12(preferences: Preferences): boolean {
  return preferences.clock === '12h'
}
