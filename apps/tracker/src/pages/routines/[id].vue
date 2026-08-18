<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppSpinner from '@shared/ui/AppSpinner.vue'
import BackLink from '@shared/ui/BackLink.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { useHabits, useRoutines, useSaveRoutines } from '@modules/habits/application/habit-queries'
import { habitsAlreadyGrouped, type Routine } from '@modules/habits/domain/routine'
import RoutineForm from '@modules/habits/ui/RoutineForm.vue'

const route = useRoute()
const router = useRouter()
const { data: routinesData, isLoading } = useRoutines()
const { data: habitsData } = useHabits()
const saveRoutines = useSaveRoutines()
const feedback = useFeedback()
const form = useTemplateRef<{ reject: (message: string) => void }>('form')

const routineId = computed(() => {
  const raw = route.params.id

  return Array.isArray(raw) ? raw[0] : raw
})

const routines = computed(() => routinesData.value ?? [])
const routine = computed(() => routines.value.find((candidate) => candidate.id === routineId.value))

async function save(edited: Routine) {
  // Taking a habit means taking it from wherever it was, so the write is the whole set: the
  // routines that lose one are saved in the same call as the one that gains it.
  const taken = habitsAlreadyGrouped(edited, routines.value)
  const others = routines.value
    .filter((other) => other.id !== edited.id)
    .map((other) => ({
      ...other,
      habitIds: other.habitIds.filter((id) => !edited.habitIds.includes(id)),
    }))

  try {
    await saveRoutines.mutateAsync([...others, edited])
    feedback.notify(
      taken.length
        ? `${edited.name} saved, and ${taken.length === 1 ? 'one habit' : `${taken.length} habits`} moved into it`
        : `${edited.name} saved`,
      'success',
    )
    await router.push('/routines')
  } catch (error) {
    form.value?.reject(error instanceof Error ? error.message : 'That routine could not be saved.')
  }
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/routines" label="Routines" />
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Edit routine</h1>
    </header>

    <div
      v-if="isLoading && routinesData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading the routine" />
    </div>

    <p
      v-else-if="!routine"
      class="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      That routine no longer exists. It may have been removed on this device.
    </p>

    <RoutineForm
      v-else
      ref="form"
      :key="routine.id"
      :initial="routine"
      :habits="habitsData ?? []"
      :others="routines"
      submit-label="Save"
      :busy="saveRoutines.isLoading.value"
      @submit="save"
    />
  </div>
</template>
