import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

import {
  type ClockFormat,
  DEFAULT_PREFERENCES,
  type Preferences,
  readPreferences,
  type ThemeChoice,
  type TimelineDetail,
  timelineScale,
  usesHour12,
  zoomedTimeline,
} from '@shared/domain/preferences'
import { formatTime } from '@shared/domain/time-of-day'

/**
 * Preferences live in localStorage, not in the database that holds the habits.
 *
 * The theme has to be applied before the first paint or the app flashes the wrong colours
 * on every launch, and IndexedDB is asynchronous by nature. These are a handful of bytes of
 * display settings rather than user data, so the trade the rest of the app refuses — a
 * synchronous store with a tiny quota — is exactly right here.
 */
const STORAGE_KEY = 'some-kaisen.preferences'

export function loadPreferences(): Preferences {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY)

    return readPreferences(stored ? JSON.parse(stored) : null)
  } catch {
    // Private browsing can make localStorage throw on access rather than return nothing.
    return DEFAULT_PREFERENCES
  }
}

/**
 * Writes the choice onto the root element for the CSS to pick up.
 *
 * `system` removes the attribute rather than setting a value, which lets the stylesheet's
 * `prefers-color-scheme` rules take over. That way following the phone is the absence of an
 * override instead of a third set of colours to keep in step.
 */
export function applyTheme(theme: ThemeChoice): void {
  const root = globalThis.document?.documentElement

  if (!root) return

  if (theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', theme)
}

export const usePreferences = defineStore('preferences', () => {
  const preferences = ref<Preferences>(loadPreferences())

  const hour12 = computed(() => usesHour12(preferences.value))

  /** The one place a time is turned into text, so the whole app agrees on the clock. */
  const formatClock = computed(
    () => (minutes: number) => formatTime(minutes, { hour12: hour12.value }),
  )

  watch(
    preferences,
    (value) => {
      applyTheme(value.theme)

      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value))
      } catch {
        // Failing to remember a preference is not worth interrupting anyone over.
      }
    },
    { deep: true, immediate: true },
  )

  function setClock(clock: ClockFormat) {
    preferences.value = { ...preferences.value, clock }
  }

  function setTheme(theme: ThemeChoice) {
    preferences.value = { ...preferences.value, theme }
  }

  /** How tall a minute is drawn and what a drag snaps to, which move together. */
  const timeline = computed(() => timelineScale(preferences.value))

  function setTimeline(detail: TimelineDetail) {
    preferences.value = { ...preferences.value, timeline: detail }
  }

  function zoomTimeline(steps: number) {
    setTimeline(zoomedTimeline(preferences.value, steps))
  }

  return {
    preferences,
    hour12,
    formatClock,
    timeline,
    setClock,
    setTheme,
    setTimeline,
    zoomTimeline,
  }
})
