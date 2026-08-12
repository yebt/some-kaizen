<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppSpinner from '@shared/ui/AppSpinner.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import type { Habit } from '@modules/habits/domain/habit'
import { useHabits, useSaveHabit } from '@modules/habits/application/habit-queries'
import HabitForm from '@modules/habits/ui/HabitForm.vue'

const route = useRoute()
const router = useRouter()
const { data: habitsData, isLoading } = useHabits()
const saveHabit = useSaveHabit()
const feedback = useFeedback()

const habitId = computed(() => {
  const raw = route.params.id

  return Array.isArray(raw) ? raw[0] : raw
})

const habit = computed(() =>
  (habitsData.value ?? []).find((candidate) => candidate.id === habitId.value),
)

async function save(edited: Habit) {
  await saveHabit.mutateAsync(edited)
  feedback.notify(`${edited.name} saved`, 'success')
  await router.push('/habits')
}
</script>

<template>
  <div class="safe-top">
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Edit habit</h1>
    </header>

    <div
      v-if="isLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading the habit" />
    </div>

    <p
      v-else-if="!habit"
      class="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      That habit no longer exists. It may have been deleted on this device.
    </p>

    <HabitForm
      v-else
      :key="habit.id"
      :initial="habit"
      submit-label="Save"
      :busy="saveHabit.isLoading.value"
      @submit="save"
    />
  </div>
</template>
