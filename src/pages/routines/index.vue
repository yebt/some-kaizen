<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { todayIn } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import ActionSheet, { type SheetAction } from '@shared/ui/ActionSheet.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import BackLink from '@shared/ui/BackLink.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { usePreferences } from '@core/preferences-store'
import { usePressHold } from '@shared/ui/press/use-press-hold'
import { isPositive } from '@modules/habits/domain/habit'
import {
  useHabits,
  useRemoveRoutine,
  useRoutines,
  useSaveRoutines,
} from '@modules/habits/application/habit-queries'
import { archiveRoutine, restoreRoutine, type Routine } from '@modules/habits/domain/routine'

const router = useRouter()
const { data: routinesData, isLoading } = useRoutines()
const { data: habitsData } = useHabits()
const saveRoutines = useSaveRoutines()
const removeRoutine = useRemoveRoutine()
const feedback = useFeedback()
const preferences = usePreferences()

const routines = computed(() => routinesData.value ?? [])
const habits = computed(() => (habitsData.value ?? []).filter(isPositive))

/**
 * What each routine actually holds today.
 *
 * Counted against the current habits rather than trusting the stored list, because a habit
 * deleted since leaves its identifier behind and a routine claiming five when it can show
 * three is the kind of small lie that makes someone stop believing the rest of the screen.
 */
const rows = computed(() =>
  // Listed in the order the day runs in, which is the order the day itself shows them. A list
  // ordered differently from the thing it describes is a list you have to translate.
  [...routines.value]
    .sort((left, right) => (left.anchorTime ?? Infinity) - (right.anchorTime ?? Infinity))
    .map((routine) => ({
      routine,
      count: routine.habitIds.filter((id) => habits.value.some((habit) => habit.id === id)).length,
    })),
)

/** The habits belonging to no routine, which is the number that says whether this is finished. */
const unarranged = computed(
  () =>
    habits.value.filter(
      (habit) => !routines.value.some((routine) => routine.habitIds.includes(habit.id)),
    ).length,
)

const menuFor = ref<Routine | null>(null)

const hold = usePressHold({
  onHold: (id) => {
    menuFor.value = routines.value.find((routine) => routine.id === id) ?? null
  },
})

const actionsFor = computed<readonly SheetAction[]>(() => {
  const archived = menuFor.value?.archivedOn !== undefined

  return [
    {
      key: 'build',
      label: 'Build into a day',
      description: 'Say when it starts and how long each step takes',
    },
    { key: 'edit', label: 'Edit', description: 'Name, habits, order, colour' },
    archived
      ? { key: 'restore', label: 'Use again', description: 'Start arranging today with it again' }
      : {
          key: 'archive',
          label: 'Archive',
          description: 'Stop arranging today with it, keep what it held',
        },
    {
      key: 'remove',
      label: 'Remove',
      description: 'Its habits stay, with nothing grouping them',
      tone: 'danger',
    },
  ]
})

async function runAction(key: string) {
  const routine = menuFor.value

  menuFor.value = null

  if (!routine) return

  if (key === 'build') {
    await router.push(`/routines/build/${routine.id}`)

    return
  }

  if (key === 'edit') {
    await router.push(`/routines/${routine.id}`)

    return
  }

  if (key === 'archive') {
    await saveRoutines.mutateAsync([archiveRoutine(routine, todayIn())])
    feedback.notify(`${routine.name} archived`)

    return
  }

  if (key === 'restore') {
    await saveRoutines.mutateAsync([restoreRoutine(routine)])
    feedback.notify(`${routine.name} is in use again`)

    return
  }

  if (key === 'remove') await onDelete(routine)
}

async function onDelete(routine: Routine) {
  const accepted = await feedback.confirm({
    title: `Remove ${routine.name}?`,
    message: 'The habits in it stay exactly as they are. Only the grouping goes.',
    confirmLabel: 'Remove',
    tone: 'danger',
  })

  if (!accepted) return

  await removeRoutine.mutateAsync(routine.id)
  feedback.notify(`${routine.name} removed`)
}

function isPressed(id: Identifier) {
  return hold.pendingKey.value === id
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/habits" label="Habits" />

    <header class="flex items-center justify-between pt-2 pb-1">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Routines</h1>
      <RouterLink
        to="/routines/new"
        class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-inverse"
      >
        <AppIcon name="plus" :size="14" />
        New
      </RouterLink>
    </header>
    <p class="pb-4 text-sm text-ink-muted">
      Parts of the day, in the order you do them. Today groups itself under their names instead of
      running as one long list.
    </p>

    <div
      v-if="isLoading && routinesData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading your routines" />
    </div>

    <template v-else>
      <p
        v-if="!rows.length"
        class="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
      >
        No routines yet. Name a part of your day — Morning, Deep work, Wind down — and put the
        habits you do then in the order you do them.
      </p>

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
          :key="row.routine.id"
          class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-transform duration-150"
          :class="[
            isPressed(row.routine.id) && 'scale-[0.97]',
            row.routine.archivedOn !== undefined && 'opacity-60',
          ]"
          @pointerdown="hold.press(row.routine.id, $event)"
          @pointermove="hold.move($event)"
          @pointerup="hold.release($event)"
          @pointercancel="hold.cancel()"
        >
          <span
            v-if="row.routine.colour"
            class="size-8 shrink-0 rounded-full border border-line"
            :style="surfaceStyle(row.routine)"
            aria-hidden="true"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-ink">{{ row.routine.name }}</p>
            <p class="text-xs text-ink-muted">
              <span v-if="row.routine.anchorTime !== undefined" class="tabular">
                {{ preferences.formatClock(row.routine.anchorTime) }} ·
              </span>
              {{ row.count === 1 ? '1 habit' : `${row.count} habits` }}
              <template v-if="row.routine.archivedOn"> · archived</template>
            </p>
          </div>
          <button
            type="button"
            class="hit-area grid size-8 shrink-0 place-items-center rounded-full border border-line-strong text-ink-muted"
            :aria-label="`Actions for ${row.routine.name}`"
            @click="menuFor = row.routine"
          >
            <AppIcon name="more" :size="16" />
          </button>
        </li>
      </TransitionGroup>

      <p v-if="rows.length && unarranged" class="mt-3 text-xs text-ink-subtle">
        {{ unarranged === 1 ? '1 habit belongs' : `${unarranged} habits belong` }} to no routine.
        Today gathers those at the end, under no heading.
      </p>
    </template>

    <ActionSheet
      :open="menuFor !== null"
      :title="menuFor?.name ?? ''"
      :actions="actionsFor"
      @select="runAction"
      @dismiss="menuFor = null"
    />
  </div>
</template>
