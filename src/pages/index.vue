<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  addDays,
  type CalendarDate,
  eachDayBetween,
  endOfWeek,
  startOfWeek,
  toDate,
  todayIn,
} from '@shared/domain/calendar-date'
import { formatTime } from '@shared/domain/time-of-day'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import DateStrip from '@shared/ui/DateStrip.vue'
import ProgressRing from '@shared/ui/ProgressRing.vue'
import { isMeasured, isNegative } from '@modules/habits/domain/habit'
import { latestEntryFor, pendingNegativeChecks } from '@modules/habits/domain/habit-entry'
import { useHabitEntries, useHabits } from '@modules/habits/application/habit-queries'
import { blocksOnDate } from '@modules/block-time/domain/block-time'
import { useBlockTime } from '@modules/block-time/application/block-time-queries'
import { spanOf } from '@modules/planning/domain/planned-instance'
import { usePlannedInstances } from '@modules/planning/application/planning-queries'

const { data: habitsData, isLoading: habitsLoading } = useHabits()
const { data: entriesData } = useHabitEntries()
const { data: instancesData } = usePlannedInstances()
const { data: blocksData } = useBlockTime()

const habits = computed(() => habitsData.value ?? [])
const entries = computed(() => entriesData.value ?? [])
const instances = computed(() => instancesData.value ?? [])
const blocks = computed(() => blocksData.value ?? [])

const today = todayIn()
const selectedDay = ref<CalendarDate>(today)
const weekAnchor = ref<CalendarDate>(today)

const weekDays = computed(() =>
  eachDayBetween(startOfWeek(weekAnchor.value), endOfWeek(weekAnchor.value)),
)

const monthLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    toDate(selectedDay.value),
  ),
)

const dayLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    toDate(selectedDay.value),
  ),
)

const habitsById = computed(() => new Map(habits.value.map((habit) => [habit.id, habit])))

const markedDays = computed(() => instances.value.map((instance) => instance.date))

/** Only the very first read shows a spinner; a refetch keeps the day on screen. */
const isFirstLoad = computed(() => habitsLoading.value && habitsData.value === undefined)
const isEmpty = computed(() => !habitsLoading.value && habits.value.length === 0)

/** Block time and scheduled habits merged into one ordered ribbon, as the day is lived. */
const schedule = computed(() => {
  const fixed = blocksOnDate(blocks.value, selectedDay.value).map((occurrence) => ({
    kind: 'block' as const,
    key: `${occurrence.block.id}-${occurrence.segment.from}`,
    name: occurrence.block.name,
    from: occurrence.segment.from,
    to: occurrence.segment.to,
    continues: occurrence.continuesFromPreviousDay || occurrence.continuesIntoNextDay,
  }))

  const scheduled = instances.value
    .filter((instance) => instance.date === selectedDay.value && instance.startsAt !== undefined)
    .map((instance) => {
      const span = spanOf(instance)

      return {
        kind: 'habit' as const,
        key: instance.id,
        name: habitsById.value.get(instance.habitId)?.name ?? 'Habit',
        from: span?.start ?? 0,
        to: (span?.start ?? 0) + instance.durationMinutes,
        continues: false,
      }
    })

  return [...fixed, ...scheduled].sort((left, right) => left.from - right.from)
})

/** Occurrences placed on the day but never pinned to a time: they simply happen today. */
const anytime = computed(() =>
  instances.value
    .filter((instance) => instance.date === selectedDay.value && instance.startsAt === undefined)
    .map((instance) => {
      const habit = habitsById.value.get(instance.habitId)
      const entry = habit ? latestEntryFor(entries.value, habit.id, selectedDay.value) : undefined
      const measured = habit && isMeasured(habit) ? habit : undefined
      const value = entry && entry.kind === 'positive' ? (entry.value ?? 0) : 0

      return {
        key: instance.id,
        name: habit?.name ?? 'Habit',
        unit: measured?.measure.unit,
        goal: measured?.measure.goal,
        value,
        progress: measured ? value / measured.measure.goal : 0,
        done: entry?.kind === 'positive' && entry.outcome === 'done',
      }
    }),
)

/** Yesterday's unanswered negative habits, which is the first thing to greet you. */
const pendingChecks = computed(() =>
  habits.value.filter(isNegative).flatMap((habit) =>
    pendingNegativeChecks(habit, entries.value, today)
      .slice(-1)
      .map((day) => ({ key: `${habit.id}-${day}`, name: habit.name, day })),
  ),
)

function shiftWeek(offset: number) {
  weekAnchor.value = addDays(weekAnchor.value, offset * 7)
}
</script>

<template>
  <div class="safe-top">
    <header class="flex items-baseline justify-between pt-2 pb-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-ink">Today</h1>
        <p class="text-sm text-ink-muted">{{ dayLabel }}</p>
      </div>
      <span
        class="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted"
      >
        {{ monthLabel }}
      </span>
    </header>

    <DateStrip
      :days="weekDays"
      :selected="selectedDay"
      :marked="markedDays"
      @select="selectedDay = $event"
      @previous="shiftWeek(-1)"
      @next="shiftWeek(1)"
    />

    <div v-if="isFirstLoad" class="mt-6 flex justify-center py-12 text-ink-subtle">
      <AppSpinner :size="24" label="Loading your day" />
    </div>

    <p
      v-else-if="isEmpty"
      class="mt-6 rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      No habits yet. Add one with the button below, or load the demo data from Settings to see how a
      full day looks.
    </p>

    <template v-else>
      <section v-if="pendingChecks.length" class="mt-6" aria-labelledby="pending-heading">
        <h2
          id="pending-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          Yesterday
        </h2>
        <ul class="space-y-2">
          <li
            v-for="check in pendingChecks"
            :key="check.key"
            class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <span
              class="grid size-9 shrink-0 place-items-center rounded-full bg-relapse-soft text-relapse"
            >
              <AppIcon name="ban" :size="18" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink">{{ check.name }}</p>
              <p class="text-xs text-ink-muted">Did you avoid it?</p>
            </div>
            <div class="flex gap-1.5">
              <button
                type="button"
                class="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-ink-inverse transition-transform active:scale-95"
              >
                Yes
              </button>
              <button
                type="button"
                class="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
              >
                No
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section class="mt-6" aria-labelledby="schedule-heading">
        <div class="mb-2 flex items-baseline justify-between">
          <h2
            id="schedule-heading"
            class="text-xs font-semibold tracking-wide text-ink-muted uppercase"
          >
            Schedule
          </h2>
          <RouterLink
            :to="`/day/${selectedDay}`"
            class="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Open timeline
          </RouterLink>
        </div>
        <ol v-if="schedule.length" class="space-y-2">
          <li v-for="item in schedule" :key="item.key" class="flex gap-3">
            <span class="tabular w-12 shrink-0 pt-3 text-right text-xs font-medium text-ink-subtle">
              {{ formatTime(item.from) }}
            </span>
            <div
              class="flex-1 rounded-card border p-3.5"
              :class="
                item.kind === 'block'
                  ? 'border-transparent bg-accent text-accent-ink'
                  : 'border-line bg-surface text-ink shadow-card'
              "
            >
              <p class="text-sm font-medium">{{ item.name }}</p>
              <p class="text-xs opacity-70">
                {{ formatTime(item.from) }} – {{ formatTime(item.to) }}
                <span v-if="item.continues">· continues</span>
              </p>
            </div>
          </li>
        </ol>
        <p
          v-else
          class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted"
        >
          Nothing scheduled. Drag a habit onto the day to give it a time.
        </p>
      </section>

      <section v-if="anytime.length" class="mt-6" aria-labelledby="anytime-heading">
        <h2
          id="anytime-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          Anytime today
        </h2>
        <ul class="space-y-2">
          <li
            v-for="item in anytime"
            :key="item.key"
            class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink">{{ item.name }}</p>
              <p v-if="item.unit" class="tabular text-xs text-ink-muted">
                {{ item.value }} / {{ item.goal }} {{ item.unit }}
              </p>
            </div>
            <ProgressRing v-if="item.unit" :value="item.progress" />
            <span
              v-else
              class="grid size-9 place-items-center rounded-full border transition-colors"
              :class="
                item.done ? 'border-done bg-done-soft text-done' : 'border-line text-ink-subtle'
              "
            >
              <AppIcon name="check" :size="18" />
            </span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
