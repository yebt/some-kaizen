<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

import { addDays, todayIn } from '@shared/domain/calendar-date'
import BackLink from '@shared/ui/BackLink.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { isMeasured, isNegative, isPositive } from '@modules/habits/domain/habit'
import { useHabitEntries, useHabits } from '@modules/habits/application/habit-queries'
import {
  dailyMarks,
  negativeStatistics,
  positiveStatistics,
} from '@modules/stats/domain/habit-statistics'
import HabitHeatmap from '@modules/stats/ui/HabitHeatmap.vue'

/** Roughly six months: long enough to show a pattern, short enough to stay one screen. */
const WINDOW_DAYS = 182

const route = useRoute()
const { data: habitsData, isLoading } = useHabits()
const { data: entriesData } = useHabitEntries()

const today = todayIn()
const windowStart = addDays(today, -WINDOW_DAYS)

const habitId = computed(() => {
  const raw = route.params.id

  return Array.isArray(raw) ? raw[0] : raw
})

const habit = computed(() =>
  (habitsData.value ?? []).find((candidate) => candidate.id === habitId.value),
)

const entries = computed(() => entriesData.value ?? [])

const marks = computed(() =>
  habit.value ? dailyMarks(habit.value, entries.value, windowStart, today) : new Map(),
)

const PERIOD_NOUN = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const

const description = computed(() => {
  const current = habit.value

  if (!current) return ''
  if (isNegative(current)) return 'Quitting · judged the morning after'

  const { period, repetitions } = current.frequency
  const times = repetitions === 1 ? 'Once' : `${repetitions} times`
  const measured = isMeasured(current)
    ? ` · ${current.measure.minimum}–${current.measure.goal} ${current.measure.unit}`
    : ''

  return `${times} a ${PERIOD_NOUN[period]}${measured}`
})

/**
 * The headline figures, worded for the kind of habit they describe.
 *
 * A positive habit is measured in periods completed, a negative one in days survived, and
 * calling both "streak" would quietly compare two different things.
 */
const figures = computed(() => {
  const current = habit.value

  if (!current) return []

  if (isPositive(current)) {
    const stats = positiveStatistics(current, entries.value, windowStart, today, today)
    const periodNoun = PERIOD_NOUN[current.frequency.period]

    return [
      { label: `${periodNoun}s in a row`, value: String(stats.currentStreak) },
      { label: 'best run', value: String(stats.longestStreak) },
      { label: 'of periods met', value: `${Math.round(stats.completionRate * 100)}%` },
      { label: 'times done', value: String(stats.totalDone) },
    ]
  }

  const stats = negativeStatistics(current, entries.value, today)

  return [
    { label: 'clean days now', value: String(stats.currentCleanStreak) },
    { label: 'best run', value: String(stats.longestCleanStreak) },
    { label: 'of judged days clean', value: `${Math.round(stats.cleanRate * 100)}%` },
    { label: 'relapses', value: String(stats.relapses) },
  ]
})

const lastRelapse = computed(() => {
  const current = habit.value

  if (!current || !isNegative(current)) return undefined

  return negativeStatistics(current, entries.value, today).lastRelapse
})
</script>

<template>
  <div class="safe-top">
    <BackLink to="/habits" label="Habits" />
    <div
      v-if="isLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading the habit" />
    </div>

    <p
      v-else-if="!habit"
      class="mt-6 rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      That habit no longer exists. It may have been deleted on this device.
    </p>

    <template v-else>
      <header class="flex items-start gap-3 pt-2 pb-4">
        <span
          v-if="habit.colour"
          class="mt-1 size-10 shrink-0 rounded-full border border-line"
          :style="surfaceStyle(habit)"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <h1 class="truncate text-2xl font-semibold tracking-tight text-ink">{{ habit.name }}</h1>
          <p class="text-sm text-ink-muted">{{ description }}</p>
        </div>
        <RouterLink
          :to="`/habits/${habit.id}/edit`"
          class="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted"
        >
          Edit
        </RouterLink>
      </header>

      <section class="grid grid-cols-2 gap-2" aria-label="Figures">
        <div
          v-for="figure in figures"
          :key="figure.label"
          class="rounded-card border border-line bg-surface p-4 shadow-card"
        >
          <p class="tabular text-2xl leading-none font-semibold text-ink">{{ figure.value }}</p>
          <p class="mt-1 text-xs text-ink-muted">{{ figure.label }}</p>
        </div>
      </section>

      <section class="mt-5" aria-labelledby="history-heading">
        <h2
          id="history-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          Last six months
        </h2>

        <div class="rounded-card border border-line bg-surface p-4 shadow-card">
          <HabitHeatmap :marks="marks" :from="windowStart" :to="today" />

          <div class="mt-3 flex flex-wrap items-center gap-3 text-[0.625rem] text-ink-subtle">
            <span class="flex items-center gap-1.5">
              <span class="size-3 rounded-[3px] bg-surface-sunken" />
              not answered
            </span>
            <span class="flex items-center gap-1.5">
              <span class="size-3 rounded-[3px] bg-done" />
              {{ habit.polarity === 'negative' ? 'clean' : 'done' }}
            </span>
            <span v-if="habit.polarity === 'positive'" class="flex items-center gap-1.5">
              <span class="size-3 rounded-[3px] bg-partial" />
              partial
            </span>
            <span class="flex items-center gap-1.5">
              <span
                class="size-3 rounded-[3px]"
                :class="habit.polarity === 'negative' ? 'bg-relapse' : 'bg-missed-soft'"
              />
              {{ habit.polarity === 'negative' ? 'relapse' : 'missed' }}
            </span>
          </div>

          <p class="mt-2 text-xs text-ink-subtle">
            A day never answered is drawn apart from a day answered badly, because forgetting to
            open the app is not the same as failing.
          </p>
        </div>
      </section>

      <p v-if="lastRelapse" class="mt-3 text-xs text-ink-muted">
        Last relapse recorded on {{ lastRelapse }}.
      </p>
    </template>
  </div>
</template>
