<script setup lang="ts">
import { computed } from 'vue'

import { addDays, todayIn } from '@shared/domain/calendar-date'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { type Habit, isNegative, isPositive } from '@modules/habits/domain/habit'
import { currentEntries } from '@modules/habits/domain/habit-entry'
import { useHabitEntries, useHabits } from '@modules/habits/application/habit-queries'
import { useBlockTime } from '@modules/block-time/application/block-time-queries'
import { negativeStatistics, positiveStatistics } from '@modules/stats/domain/habit-statistics'

/** Roughly six months, matching the per-habit view so the two figures agree. */
const WINDOW_DAYS = 182

const { data: habitsData, isLoading } = useHabits()
const { data: entriesData } = useHabitEntries()
const { data: blocksData } = useBlockTime()

const today = todayIn()
const windowStart = addDays(today, -WINDOW_DAYS)

const habits = computed(() => habitsData.value ?? [])
const entries = computed(() => entriesData.value ?? [])
const blocks = computed(() => blocksData.value ?? [])

const live = computed(() => habits.value.filter((habit) => habit.archivedOn === undefined))

/** Streak and completion for one habit, in whichever terms suit its kind. */
function summarise(habit: Habit) {
  if (isPositive(habit)) {
    const stats = positiveStatistics(habit, entries.value, windowStart, today, today)

    return {
      streak: stats.currentStreak,
      best: stats.longestStreak,
      rate: stats.completionRate,
      unit: 'periods met',
    }
  }

  const stats = negativeStatistics(habit, entries.value, today)

  return {
    streak: stats.currentCleanStreak,
    best: stats.longestCleanStreak,
    rate: stats.cleanRate,
    unit: 'days clean',
  }
}

const rows = computed(() =>
  live.value
    .map((habit) => ({ habit, ...summarise(habit) }))
    // Longest current run first: the point of this screen is what is going well right now.
    .sort((left, right) => right.streak - left.streak),
)

/**
 * Days with at least one answer, not entries written.
 *
 * Counting entries would reward correcting the same day twice, which is bookkeeping rather
 * than effort.
 */
const daysRecorded = computed(
  () => new Set(currentEntries(entries.value).map((entry) => entry.date)).size,
)

const bestRun = computed(() => rows.value.reduce((best, row) => Math.max(best, row.best), 0))

/** Hours a week the fixed day already claims, which is what habits have to fit around. */
const committedHours = computed(() =>
  Math.round(
    blocks.value.reduce(
      (total, block) => total + block.span.durationMinutes * block.weekdays.length,
      0,
    ) / 60,
  ),
)

const headline = computed(() => [
  { label: 'habits tracked', value: String(live.value.length) },
  { label: 'days recorded', value: String(daysRecorded.value) },
  { label: 'best run ever', value: String(bestRun.value) },
  { label: 'hours a week booked', value: String(committedHours.value) },
])
</script>

<template>
  <div class="safe-top">
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Statistics</h1>
      <p class="text-sm text-ink-muted">The last six months across everything you track</p>
    </header>

    <div
      v-if="isLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading statistics" />
    </div>

    <p
      v-else-if="!live.length"
      class="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      Nothing to measure yet. Create a habit and this fills in as you record days.
    </p>

    <template v-else>
      <section class="grid grid-cols-2 gap-2" aria-label="Overall">
        <div
          v-for="figure in headline"
          :key="figure.label"
          class="rounded-card border border-line bg-surface p-4 shadow-card"
        >
          <p class="tabular text-2xl leading-none font-semibold text-ink">{{ figure.value }}</p>
          <p class="mt-1 text-xs text-ink-muted">{{ figure.label }}</p>
        </div>
      </section>

      <section class="mt-5" aria-labelledby="per-habit-heading">
        <h2
          id="per-habit-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          Going best right now
        </h2>

        <ul class="space-y-2">
          <li v-for="row in rows" :key="row.habit.id">
            <RouterLink
              :to="`/habits/${row.habit.id}`"
              class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
            >
              <span
                v-if="row.habit.colour"
                class="size-8 shrink-0 rounded-full border border-line"
                :style="surfaceStyle(row.habit)"
                aria-hidden="true"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium text-ink">{{ row.habit.name }}</p>
                <p class="tabular text-xs text-ink-muted">
                  {{ Math.round(row.rate * 100) }}% {{ row.unit }} · best {{ row.best }}
                </p>
              </div>
              <div class="shrink-0 text-right">
                <p class="tabular text-lg leading-none font-semibold text-ink">{{ row.streak }}</p>
                <p class="text-[0.625rem] text-ink-subtle">
                  {{ isNegative(row.habit) ? 'clean days' : 'in a row' }}
                </p>
              </div>
              <AppIcon name="chevron-right" :size="16" />
            </RouterLink>
          </li>
        </ul>
      </section>

      <p class="mt-4 text-xs text-ink-subtle">
        Days recorded counts days you answered, not answers written, so correcting the same day
        twice does not flatter the total.
      </p>
    </template>
  </div>
</template>
