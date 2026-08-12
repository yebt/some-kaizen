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

export interface Preferences {
  readonly clock: ClockFormat
  readonly theme: ThemeChoice
}

export const DEFAULT_PREFERENCES: Preferences = { clock: '24h', theme: 'system' }

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
  }
}

/** Whether times should be rendered on a 12 hour clock. */
export function usesHour12(preferences: Preferences): boolean {
  return preferences.clock === '12h'
}
