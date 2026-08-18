<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { addDays, todayIn } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import ActionSheet, { type SheetAction } from '@shared/ui/ActionSheet.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { usePressHold } from '@shared/ui/press/use-press-hold'
import { describeFrequency } from '@modules/habits/ui/frequency-label'
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

const router = useRouter()
const { data: habitsData, isLoading } = useHabits()
const { data: entriesData } = useHabitEntries()
const archive = useArchiveHabit()
const remove = useDeleteHabit()
const feedback = useFeedback()

const today = todayIn()
const windowStart = addDays(today, -SUMMARY_WINDOW_DAYS)

const habits = computed(() => habitsData.value ?? [])
const entries = computed(() => entriesData.value ?? [])

function describe(habit: Habit): string {
  if (isNegative(habit)) return 'Quitting · marked the next morning'

  const measured = isMeasured(habit)
    ? ` · ${habit.measure.minimum}–${habit.measure.goal} ${habit.measure.unit}`
    : ''

  return `${describeFrequency(habit.frequency)}${measured}`
}

/** One honest headline number per habit, rather than a wall of figures nobody reads. */
function summarise(habit: Habit): { label: string; value: number } {
  if (isPositive(habit)) {
    return {
      label: 'streak',
      value: positiveStatistics(habit, entries.value, windowStart, today, today).currentStreak,
    }
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

const menuFor = ref<Habit | null>(null)

/**
 * A completed hold is followed by an ordinary click when the finger lifts.
 *
 * Left alone that click would navigate into the habit behind the menu that just opened, so
 * the next one is swallowed in the capture phase.
 */
const swallowNextClick = ref(false)

/**
 * Holding a row opens the same menu the button does.
 *
 * The hold is a shortcut, never the only way in: an affordance nobody can see is one most
 * people never find, which is why the button stays. Nothing on this list is draggable, so
 * the hold has no drag gesture to compete with here.
 */
const hold = usePressHold({
  onHold: (id) => {
    menuFor.value = habits.value.find((habit) => habit.id === id) ?? null
    swallowNextClick.value = menuFor.value !== null
  },
})

function onRowClick(event: MouseEvent) {
  if (!swallowNextClick.value) return

  swallowNextClick.value = false
  event.preventDefault()
  event.stopPropagation()
}

const menuActions = computed<SheetAction[]>(() => {
  const habit = menuFor.value

  if (!habit) return []

  return [
    { key: 'edit', label: 'Edit', description: 'Name, frequency, colour' },
    ...(habit.archivedOn
      ? []
      : [
          {
            key: 'archive',
            label: 'Archive',
            description: 'Stop planning it and keep every record',
          },
        ]),
    {
      key: 'delete',
      label: 'Delete',
      description: 'Remove it and its whole history',
      tone: 'danger' as const,
    },
  ]
})

async function runAction(key: string) {
  const habit = menuFor.value

  menuFor.value = null

  if (!habit) return

  if (key === 'edit') {
    await router.push(`/habits/${habit.id}/edit`)

    return
  }

  if (key === 'archive') await onArchive(habit)
  if (key === 'delete') await onDelete(habit)
}

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

function isPressed(id: Identifier) {
  return hold.pendingKey.value === id
}
</script>

<template>
  <div class="safe-top">
    <header class="flex items-center justify-between pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Habits</h1>
      <div class="flex items-center gap-3">
        <RouterLink
          to="/habits/ideas"
          class="hit-area grid size-9 place-items-center rounded-full border border-line-strong text-ink-muted"
          aria-label="Ideas"
        >
          <AppIcon name="idea" :size="16" />
        </RouterLink>
        <RouterLink
          to="/stats"
          class="hit-area grid size-9 place-items-center rounded-full border border-line-strong text-ink-muted"
          aria-label="Statistics"
        >
          <AppIcon name="chart" :size="16" />
        </RouterLink>
        <RouterLink
          to="/habits/new"
          class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-inverse"
        >
          <AppIcon name="plus" :size="14" />
          New
        </RouterLink>
      </div>
    </header>

    <!--
      Block time is the other half of a day, and routines are how this list stops being a list,
      so both are reachable from here rather than only from Settings, where nobody looks for
      them while thinking about their habits.
    -->
    <div class="mb-4 grid grid-cols-2 gap-2">
      <RouterLink
        to="/routines"
        class="flex items-center gap-2 rounded-card border border-line bg-surface p-3.5 shadow-card"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-ink">Routines</p>
          <p class="text-xs text-ink-muted">Group the day into its parts</p>
        </div>
        <AppIcon name="chevron-right" :size="18" class="shrink-0" />
      </RouterLink>
      <RouterLink
        to="/block-time"
        class="flex items-center gap-2 rounded-card border border-line bg-surface p-3.5 shadow-card"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-ink">Block time</p>
          <p class="text-xs text-ink-muted">Sleep, work, the fixed day</p>
        </div>
        <AppIcon name="chevron-right" :size="18" class="shrink-0" />
      </RouterLink>
    </div>

    <div
      v-if="isLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading habits" />
    </div>

    <!--
      The empty state is the one place an idea is genuinely wanted, so it is offered here
      rather than hidden behind a menu. "Create your first habit" is a reasonable instruction
      only for someone who already knows what they want to track; a first habit is the hardest
      habit precisely because nothing on the screen yet says what this app is for.
    -->
    <div
      v-else-if="!rows.length"
      class="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      <p>Nothing here yet. Whatever you add shows up on Today.</p>
      <RouterLink
        to="/habits/ideas"
        class="mt-4 inline-flex items-center gap-1.5 rounded-full border border-line-strong px-4 py-2.5 text-xs font-medium text-ink"
      >
        Not sure? Start from an idea
        <AppIcon name="chevron-right" :size="14" />
      </RouterLink>
    </div>

    <!--
      Rows fade and slide rather than appearing and vanishing. A list that changes instantly
      leaves you scanning to work out which one was added or removed; a hundred and fifty
      milliseconds of movement answers that without a word.
    -->
    <TransitionGroup
      v-else
      tag="ul"
      class="space-y-2"
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="-translate-y-2 scale-98 opacity-0 motion-reduce:translate-y-0 motion-reduce:scale-100"
      leave-active-class="absolute inset-x-0 transition duration-150 ease-in"
      leave-to-class="translate-x-4 opacity-0 motion-reduce:translate-x-0"
      move-class="transition-transform duration-200"
    >
      <li
        v-for="row in rows"
        :key="row.habit.id"
        class="rounded-card border border-line bg-surface p-4 shadow-card transition-transform duration-150"
        :class="[row.isArchived && 'opacity-60', isPressed(row.habit.id) && 'scale-[0.97]']"
        @click.capture="onRowClick"
        @pointerdown="hold.press(row.habit.id, $event)"
        @pointermove="hold.move($event)"
        @pointerup="hold.release($event)"
        @pointercancel="hold.cancel()"
      >
        <div class="flex items-start gap-3">
          <span
            v-if="row.habit.colour"
            class="mt-0.5 size-8 shrink-0 rounded-full border border-line"
            :style="surfaceStyle(row.habit)"
            aria-hidden="true"
          />
          <RouterLink :to="`/habits/${row.habit.id}`" class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink">
              {{ row.habit.name }}
              <span v-if="row.isArchived" class="text-xs font-normal text-ink-subtle">
                · archived
              </span>
            </p>
            <p class="mt-0.5 text-xs text-ink-muted">{{ row.description }}</p>
            <p class="mt-1 text-[0.625rem] text-ink-subtle">
              Tap for statistics · hold for actions
            </p>
          </RouterLink>
          <div class="flex shrink-0 items-center gap-2">
            <div class="text-right">
              <p class="tabular text-lg leading-none font-semibold text-ink">
                {{ row.summary.value }}
              </p>
              <p class="text-[0.625rem] text-ink-subtle">{{ row.summary.label }}</p>
            </div>
            <button
              type="button"
              class="hit-area grid size-8 place-items-center rounded-full border border-line-strong text-ink-muted"
              :aria-label="`Actions for ${row.habit.name}`"
              @click="menuFor = row.habit"
            >
              <AppIcon name="more" :size="16" />
            </button>
          </div>
        </div>
      </li>
    </TransitionGroup>

    <ActionSheet
      :open="menuFor !== null"
      :title="menuFor?.name ?? ''"
      :actions="menuActions"
      @select="runAction"
      @dismiss="menuFor = null"
    />
  </div>
</template>
