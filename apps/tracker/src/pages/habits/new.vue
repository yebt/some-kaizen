<script setup lang="ts">
import { useRouter } from 'vue-router'

import BackLink from '@shared/ui/BackLink.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import type { Habit } from '@modules/habits/domain/habit'
import { useSaveHabit } from '@modules/habits/application/habit-queries'
import HabitForm from '@modules/habits/ui/HabitForm.vue'

const router = useRouter()
const saveHabit = useSaveHabit()
const feedback = useFeedback()

async function create(habit: Habit) {
  await saveHabit.mutateAsync(habit)
  feedback.notify(`${habit.name} created`, 'success')
  await router.push('/habits')
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/habits" label="Habits" />
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">New habit</h1>
    </header>

    <HabitForm submit-label="Create" :busy="saveHabit.isLoading.value" @submit="create" />
  </div>
</template>
