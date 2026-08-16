<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import BackLink from '@shared/ui/BackLink.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { usePreferences } from '@core/preferences-store'
import {
  useHabits,
  useRoutines,
  useSaveHabits,
  useSaveRoutines,
} from '@modules/habits/application/habit-queries'
import { presetMinutes, ROUTINE_PRESETS } from '@modules/habits/domain/preset-library'
import { importPreset, type RoutinePreset } from '@modules/habits/domain/routine-preset'

/**
 * Routines to start from, instead of a blank form.
 *
 * The hard part of a habit tracker is not the tracking, it is the blank page. "Name a part of
 * your day and list what you do in it" is a reasonable request only for someone who already
 * knows the answer, and everyone else closes the form.
 *
 * What lands is ordinary: real habits and a real routine, editable from the moment they
 * arrive. Nothing here stays a template.
 */
const router = useRouter()
const feedback = useFeedback()
const preferences = usePreferences()

const { data: habitsData, isLoading: habitsLoading } = useHabits()
const { data: routinesData, isLoading: routinesLoading } = useRoutines()
const saveHabits = useSaveHabits()
const saveRoutines = useSaveRoutines()

const habits = computed(() => habitsData.value ?? [])
const routines = computed(() => routinesData.value ?? [])
const isLoading = computed(() => habitsLoading.value || routinesLoading.value)
const busy = computed(() => saveHabits.isLoading.value || saveRoutines.isLoading.value)

function planFor(preset: RoutinePreset) {
  return importPreset(
    preset,
    { habits: habits.value, routines: routines.value },
    { routineId: newIdentifier(), newHabitId: newIdentifier, today: todayIn() },
  )
}

/**
 * What each preset would actually do to *this* app, worked out before it is offered.
 *
 * Shown on the row rather than only in the confirmation, because "adds 3 habits" and "adds 1,
 * uses 2 you already have" are different offers and only one of them is true. Someone who
 * already meditates should be able to see that their meditation is what goes in.
 */
const rows = computed(() =>
  ROUTINE_PRESETS.map((preset) => {
    const plan = planFor(preset)

    return { preset, minutes: presetMinutes(preset), reused: plan.reused.length }
  }),
)

function countOf(created: number, reused: number): string {
  const parts = [
    created ? `${created} new ${created === 1 ? 'habit' : 'habits'}` : '',
    reused ? `${reused} you already track` : '',
  ].filter(Boolean)

  return parts.join(' and ')
}

async function add(preset: RoutinePreset) {
  const plan = planFor(preset)

  const accepted = await feedback.confirm({
    title: `Add ${preset.name}?`,
    // Named rather than counted where it matters: a reused habit is one you have history on,
    // and being told which by name is what makes the merge believable rather than magic.
    message: plan.reused.length
      ? `This adds ${countOf(plan.created.length, plan.reused.length)}. ${plan.reused
          .map((habit) => habit.name)
          .join(', ')} moves into it, keeping everything already recorded.`
      : `This adds ${countOf(plan.created.length, 0)}, and a routine holding them.`,
    confirmLabel: 'Add it',
  })

  if (!accepted) return

  // Habits before routines: a routine saved first would spend a moment referring to habits
  // that are not there yet, and any screen reading in between would count them as missing.
  if (plan.created.length) await saveHabits.mutateAsync(plan.created)

  await saveRoutines.mutateAsync(plan.routines)

  feedback.notify(`${preset.name} added`, 'success')
  await router.push('/routines')
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/routines" label="Routines" />

    <header class="pt-2 pb-1">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Start from a routine</h1>
    </header>
    <p class="pb-5 text-sm text-ink-muted">
      Worked examples to copy and then argue with. What lands is ordinary habits and an ordinary
      routine — edit or throw away any of it afterwards.
    </p>

    <div
      v-if="isLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading" />
    </div>

    <ul v-else class="space-y-3">
      <li
        v-for="row in rows"
        :key="row.preset.key"
        class="rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="text-sm font-medium text-ink">{{ row.preset.name }}</h2>
            <p class="mt-0.5 text-xs text-ink-muted">{{ row.preset.summary }}</p>
          </div>
          <span class="tabular shrink-0 text-xs text-ink-subtle">{{ row.minutes }} min</span>
        </div>

        <ol class="mt-3 space-y-1">
          <li
            v-for="step in row.preset.steps"
            :key="step.name"
            class="flex items-baseline justify-between gap-2 text-xs"
          >
            <span class="truncate text-ink">{{ step.name }}</span>
            <span class="tabular shrink-0 text-ink-subtle">{{ step.durationMinutes }} min</span>
          </li>
        </ol>

        <p v-if="row.preset.anchorTime !== undefined" class="mt-2 text-[0.625rem] text-ink-subtle">
          Usually starts
          <span class="tabular">{{ preferences.formatClock(row.preset.anchorTime) }}</span>
        </p>

        <!--
          Said before the tap, not after it. Someone who already meditates should see that
          their meditation is what goes in, rather than fearing a second copy of it.
        -->
        <p v-if="row.reused" class="mt-2 text-[0.625rem] text-ink-subtle">
          Uses {{ row.reused }} habit{{ row.reused === 1 ? '' : 's' }} you already track.
        </p>

        <button
          type="button"
          class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-line-strong px-4 py-2.5 text-xs font-medium text-ink disabled:opacity-60"
          :disabled="busy"
          :aria-label="`Add ${row.preset.name}`"
          @click="add(row.preset)"
        >
          <AppIcon name="plus" :size="14" />
          Add this routine
        </button>
      </li>
    </ul>
  </div>
</template>
