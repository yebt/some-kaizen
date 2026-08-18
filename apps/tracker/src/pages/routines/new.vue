<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'

import BackLink from '@shared/ui/BackLink.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { useHabits, useRoutines, useSaveRoutines } from '@modules/habits/application/habit-queries'
import { habitsAlreadyGrouped, type Routine } from '@modules/habits/domain/routine'
import RoutineForm from '@modules/habits/ui/RoutineForm.vue'

const router = useRouter()
const { data: habitsData } = useHabits()
const { data: routinesData } = useRoutines()
const saveRoutines = useSaveRoutines()
const feedback = useFeedback()
const form = useTemplateRef<{ reject: (message: string) => void }>('form')

const routines = computed(() => routinesData.value ?? [])

async function create(routine: Routine) {
  // A habit belongs to one routine, so taking it means taking it from the other. Saved as a
  // set because that rule is about the whole arrangement and half a move would break it.
  const taken = habitsAlreadyGrouped(routine, routines.value)
  const others = routines.value.map((other) => ({
    ...other,
    habitIds: other.habitIds.filter((id) => !routine.habitIds.includes(id)),
  }))

  try {
    await saveRoutines.mutateAsync([...others, routine])
    feedback.notify(
      taken.length
        ? `${routine.name} added, and moved ${taken.length} out of where they were`
        : `${routine.name} added`,
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
      <h1 class="text-2xl font-semibold tracking-tight text-ink">New routine</h1>
      <p class="text-sm text-ink-muted">A part of the day, and what happens in it.</p>
    </header>

    <RoutineForm
      ref="form"
      :habits="habitsData ?? []"
      :others="routines"
      submit-label="Add routine"
      :busy="saveRoutines.isLoading.value"
      @submit="create"
    />
  </div>
</template>
