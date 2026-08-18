<script setup lang="ts">
import { computed, ref } from 'vue'

import { type CalendarDate, calendarDate, isBefore, todayIn } from '@shared/domain/calendar-date'
import AppIcon from '@shared/ui/AppIcon.vue'
import BackLink from '@shared/ui/BackLink.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import SegmentedControl from '@shared/ui/SegmentedControl.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { type Habit, isNegative, isPositive } from '@modules/habits/domain/habit'
import { currentEntries } from '@modules/habits/domain/habit-entry'
import { useHabitEntries, useHabits } from '@modules/habits/application/habit-queries'
import { useBlockTime } from '@modules/block-time/application/block-time-queries'
import { negativeStatistics, positiveStatistics } from '@modules/stats/domain/habit-statistics'
import {
  DEFAULT_STAT_WINDOW,
  rangeFor,
  STAT_WINDOWS,
  type StatWindowKey,
  statWindow,
} from '@modules/stats/domain/stat-window'
import { MINIMUM_ANSWERED_DAYS, weekdayBreakdown } from '@modules/stats/domain/weekday-breakdown'

const { data: habitsData, isLoading } = useHabits()
const { data: entriesData } = useHabitEntries()
const { data: blocksData } = useBlockTime()

const today = todayIn()

const habits = computed(() => habitsData.value ?? [])
const entries = computed(() => entriesData.value ?? [])
const blocks = computed(() => blocksData.value ?? [])

const live = computed(() => habits.value.filter((habit) => habit.archivedOn === undefined))

/**
 * The window every figure below is measured over.
 *
 * Not remembered between visits on purpose. It is a question you ask of the data — "how has
 * the last week gone" — rather than a preference about the app, and a screen that silently
 * reopens on a window you chose a month ago is a screen whose numbers you misread.
 */
const window = ref<StatWindowKey>(DEFAULT_STAT_WINDOW)

const segments = computed(() =>
  STAT_WINDOWS.map((option) => ({ value: option.key, label: option.label })),
)

/**
 * Where the history actually begins.
 *
 * Every window is clamped to this, so a thirty day window on an app used for six is measured
 * over six rather than over twenty-four days nobody could have answered.
 */
const earliest = computed<CalendarDate>(() =>
  habits.value.reduce<CalendarDate>(
    (oldest, habit) => (isBefore(habit.createdOn, oldest) ? habit.createdOn : oldest),
    today,
  ),
)

/**
 * The two ends a chosen window is given, as the fields' own strings.
 *
 * Empty until somebody types, and the domain reads an empty end as "the whole history" and
 * "today" — so choosing the window and choosing nothing else shows everything rather than
 * nothing, which is the more useful half-answer.
 */
const chosenFrom = ref('')
const chosenTo = ref('')

function readDate(value: string): CalendarDate | undefined {
  if (!value) return undefined

  try {
    return calendarDate(value)
  } catch {
    // A half typed date is a moment mid-edit, not an error to report.
    return undefined
  }
}

const range = computed(() =>
  rangeFor(statWindow(window.value), today, earliest.value, {
    from: readDate(chosenFrom.value),
    to: readDate(chosenTo.value),
  }),
)

const from = computed(() => range.value.from)
const to = computed(() => range.value.to)

const isChosen = computed(() => statWindow(window.value).chosen === true)

/** Streak and completion for one habit, in whichever terms suit its kind. */
function summarise(habit: Habit) {
  if (isPositive(habit)) {
    const stats = positiveStatistics(habit, entries.value, from.value, to.value, today)

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
  () =>
    new Set(
      currentEntries(entries.value)
        // Both ends, now that one of the windows can end before today.
        .filter((entry) => !isBefore(entry.date, from.value) && !isBefore(to.value, entry.date))
        .map((entry) => entry.date),
    ).size,
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
  { label: 'best run', value: String(bestRun.value) },
  { label: 'hours a week booked', value: String(committedHours.value) },
])

const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function weekdayName(weekday: number): string {
  return WEEKDAY_NAMES[weekday - 1] ?? '?'
}

/**
 * How the whole week goes, across everything being tracked.
 *
 * The most actionable number here and the one a streak cannot give you. A streak says how
 * long you have kept something up; it does not say what to change. "Worst day: Tuesday, 41%"
 * does — you go and look at your Tuesdays.
 */
const week = computed(() => {
  const perDay = new Map<number, { answered: number; kept: number }>()

  for (const habit of live.value) {
    for (const day of weekdayBreakdown(habit, entries.value, from.value, to.value).days) {
      const tally = perDay.get(day.weekday) ?? { answered: 0, kept: 0 }

      perDay.set(day.weekday, {
        answered: tally.answered + day.answered,
        kept: tally.kept + day.kept,
      })
    }
  }

  return [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const tally = perDay.get(weekday) ?? { answered: 0, kept: 0 }

    return {
      weekday,
      name: weekdayName(weekday),
      answered: tally.answered,
      rate: tally.answered === 0 ? undefined : tally.kept / tally.answered,
    }
  })
})

/**
 * The weekdays answered often enough to say anything about.
 *
 * The same threshold the per-habit breakdown uses, applied again here because this figure is
 * an aggregate across habits and the threshold does not survive the addition: a Monday
 * answered once and a Tuesday answered once add up to two answered weekdays, and calling one
 * of them your best day is reading a pattern off two data points.
 */
const readableWeekdays = computed(() =>
  week.value.filter((day) => day.answered >= MINIMUM_ANSWERED_DAYS),
)

/**
 * The two ends of the week, when there are two ends to name.
 *
 * Absent on a flat week, where best and worst would be the same number wearing two labels,
 * and absent when only one weekday is readable — the sort then puts the same day at both
 * ends, which the equality check below catches.
 */
const extremes = computed(() => {
  const sorted = [...readableWeekdays.value].sort(
    (left, right) => (right.rate ?? 0) - (left.rate ?? 0),
  )
  const best = sorted[0]
  const worst = sorted.at(-1)

  if (!best || !worst || best.rate === worst.rate) return undefined

  return { best, worst }
})

function percent(rate: number | undefined): string {
  return rate === undefined ? '—' : `${Math.round(rate * 100)}%`
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/habits" label="Habits" />
    <header class="pt-2 pb-3">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Statistics</h1>
      <p class="text-sm text-ink-muted">Everything you track, over a window you choose</p>
    </header>

    <SegmentedControl v-model="window" :segments="segments" label="How far back to measure" />

    <!--
      Shown only for the window that has ends to choose. A pair of date fields sitting under
      "30d" would be two controls arguing about the same question.
    -->
    <div v-if="isChosen" class="mt-2 flex gap-2">
      <label class="flex-1 text-xs font-medium text-ink-muted">
        From
        <input
          v-model="chosenFrom"
          type="date"
          :max="today"
          aria-label="Measure from"
          class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal text-ink"
        />
      </label>
      <label class="flex-1 text-xs font-medium text-ink-muted">
        To
        <input
          v-model="chosenTo"
          type="date"
          :max="today"
          aria-label="Measure to"
          class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal text-ink"
        />
      </label>
    </div>

    <div
      v-if="isLoading && habitsData === undefined"
      class="mt-5 flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading statistics" />
    </div>

    <p
      v-else-if="!live.length"
      class="mt-5 rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      Nothing to measure yet. Create a habit and this fills in as you record days.
    </p>

    <template v-else>
      <section class="mt-4 grid grid-cols-2 gap-2" aria-label="Overall">
        <div
          v-for="figure in headline"
          :key="figure.label"
          class="rounded-card border border-line bg-surface p-4 shadow-card"
        >
          <p class="tabular text-2xl leading-none font-semibold text-ink">{{ figure.value }}</p>
          <p class="mt-1 text-xs text-ink-muted">{{ figure.label }}</p>
        </div>
      </section>

      <section class="mt-5" aria-labelledby="weekday-heading">
        <h2
          id="weekday-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          Across the week
        </h2>

        <div class="rounded-card border border-line bg-surface p-4 shadow-card">
          <!--
            A bar per weekday rather than a sentence alone. The sentence tells you the answer;
            the bars let you disagree with it, which is what stops a single figure from being
            taken on faith.
          -->
          <ul class="flex items-end gap-1.5" aria-label="Rate by day of the week">
            <li
              v-for="day in week"
              :key="day.weekday"
              class="flex flex-1 flex-col items-center gap-1"
            >
              <span class="tabular text-[0.5625rem] text-ink-subtle">{{ percent(day.rate) }}</span>
              <span
                class="flex h-16 w-full items-end rounded-cell bg-surface-sunken"
                role="img"
                :aria-label="`${day.name}: ${
                  day.answered === 0
                    ? 'nothing answered'
                    : `${percent(day.rate)} of ${day.answered} days`
                }`"
              >
                <span
                  class="w-full rounded-cell bg-done transition-[height] duration-300"
                  :style="{ height: `${Math.max((day.rate ?? 0) * 100, day.answered ? 4 : 0)}%` }"
                />
              </span>
              <span class="text-[0.625rem] text-ink-muted">{{ day.name }}</span>
            </li>
          </ul>

          <p v-if="extremes" class="mt-3 text-xs text-ink">
            Best day
            <span class="font-medium">{{ extremes.best.name }}</span>
            ({{ percent(extremes.best.rate) }}), worst
            <span class="font-medium">{{ extremes.worst.name }}</span>
            ({{ percent(extremes.worst.rate) }}).
          </p>
          <p v-else class="mt-3 text-xs text-ink-muted">
            Not enough answered days yet to call one day better than another.
          </p>
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
        Rates are measured over days you answered, not over every day in the window, so time away
        from the app is not counted against you. Days recorded counts days, not answers written.
      </p>
    </template>
  </div>
</template>
