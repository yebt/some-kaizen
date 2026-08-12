<script setup lang="ts">
import { computed } from 'vue'

import { addDays, todayIn } from '@shared/domain/calendar-date'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import {
  archiveHabit,
  type Habit,
  isMeasured,
  isNegative,
  isPositive,
} from '@modules/habits/domain/habit'
import {
  useArchiveHabit,
  useDeleteHabit,
  useHabitEntries,
  useHabits,
} from '@modules/habits/application/habit-queries'
import { negativeStatistics, positiveStatistics } from '@modules/stats/domain/habit-statistics'

/** Long enough for a streak to mean something, short enough to stay quick to compute. */
const SUMMARY_WINDOW_DAYS = 90

const { data: habitsData, isLoading } = useHabits()
const { data: entriesData } = useHabitEntries()
const archive = useArchiveHabit()
const remove = useDeleteHabit()
const feedback = useFeedback()

const today = todayIn()
const windowStart = addDays(today, -SUMMARY_WINDOW_DAYS)

const habits = computed(() => habitsData.value ?? [])
const entries = computed(() => entriesData.value ?? [])

const PERIOD_NOUN = { daily: 'day', weekly: 'week', monthly: 'month', yearly: 'year' } as const

function describe(habit: Habit): string {
  if (isNegative(habit)) return 'Quitting · marked the next morning'

  const { period, repetitions } = habit.frequency
  const times = repetitions === 1 ? 'Once' : `${repetitions} times`
  const measured = isMeasured(habit)
    ? ` · ${habit.measure.minimum}–${habit.measure.goal} ${habit.measure.unit}`
    : ''

  return `${times} a ${PERIOD_NOUN[period]}${measured}`
}

/** One honest headline number per habit, rather than a wall of figures nobody reads. */
function summarise(habit: Habit): { label: string; value: number } {
  if (isPositive(habit)) {
    const stats = positiveStatistics(habit, entries.value, windowStart, today, today)

    return { label: 'streak', value: stats.currentStreak }
  }

  return {
    label: 'clean days',
    value: negativeStatistics(habit, entries.value, today).currentCleanStreak,
  }
}

const rows = computed(() =>
  habits.value.map((habit) => ({
    habit,
    description: describe(habit),
    summary: summarise(habit),
    isArchived: habit.archivedOn !== undefined,
  })),
)

async function onArchive(habit: Habit) {
  const accepted = await feedback.confirm({
    title: `Archive ${habit.name}?`,
    message:
      'It stops appearing in planning, and everything you have already recorded stays exactly as it is.',
    confirmLabel: 'Archive',
  })

  if (!accepted) return

  await archive.mutateAsync(archiveHabit(habit, today))
  feedback.notify(`${habit.name} archived`)
}

async function onDelete(habit: Habit) {
  const accepted = await feedback.confirm({
    title: `Delete ${habit.name}?`,
    message:
      'Its planned occurrences and its whole history go with it. To keep the history and simply stop tracking, archive it instead.',
    confirmLabel: 'Delete',
    tone: 'danger',
  })

  if (!accepted) return

  await remove.mutateAsync(habit.id)
  feedback.notify(`${habit.name} deleted`, 'danger')
}
</script>

<template>
  <div class="safe-top">
    <header class="flex items-center justify-between pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Habits</h1>
      <RouterLink
        to="/habits/new"
        class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-inverse"
      >
        <AppIcon name="plus" :size="14" />
        New
      </RouterLink>
    </header>

    <div
      v-if="isLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading habits" />
    </div>

    <p
      v-else-if="!rows.length"
      class="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      Nothing here yet. Create your first habit and it will show up on Today.
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="row in rows"
        :key="row.habit.id"
        class="rounded-card border border-line bg-surface p-4 shadow-card"
        :class="row.isArchived ? 'opacity-60' : ''"
      >
        <div class="flex items-start gap-3">
          <span
            v-if="row.habit.colour"
            class="mt-0.5 size-8 shrink-0 rounded-full border border-line"
            :style="surfaceStyle(row.habit)"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink">
              {{ row.habit.name }}
              <span v-if="row.isArchived" class="text-xs font-normal text-ink-subtle">
                · archived
              </span>
            </p>
            <p class="mt-0.5 text-xs text-ink-muted">{{ row.description }}</p>
          </div>
          <div class="shrink-0 text-right">
            <p class="tabular text-lg leading-none font-semibold text-ink">
              {{ row.summary.value }}
            </p>
            <p class="text-[0.625rem] text-ink-subtle">{{ row.summary.label }}</p>
          </div>
        </div>

        <div class="mt-3 flex gap-2">
          <RouterLink
            :to="`/habits/${row.habit.id}`"
            class="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Edit
          </RouterLink>
          <button
            v-if="!row.isArchived"
            type="button"
            class="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
            @click="onArchive(row.habit)"
          >
            Archive
          </button>
          <button
            type="button"
            class="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-relapse"
            @click="onDelete(row.habit)"
          >
            Delete
          </button>
        </div>
      </li>
    </ul>
  </div>
</template>
