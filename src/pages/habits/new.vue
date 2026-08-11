<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  type FrequencyPeriod,
  type Habit,
  MAX_HABIT_NAME_LENGTH,
  measure,
} from '@modules/habits/domain/habit'
import { useSaveHabit } from '@modules/habits/application/habit-queries'

/**
 * The three kinds are chosen up front rather than derived from which fields got filled in.
 *
 * A habit you are building and a habit you are quitting are not variations of one thing:
 * one is planned in advance, the other is judged the morning after. Asking plainly avoids a
 * form that silently changes meaning as you type.
 */
type HabitKind = 'completed' | 'measured' | 'negative'

const KINDS: ReadonlyArray<{ value: HabitKind; title: string; description: string }> = [
  {
    value: 'completed',
    title: 'Did it',
    description: 'Done or not done. Meditate, stretch, read.',
  },
  {
    value: 'measured',
    title: 'Measured',
    description: 'Track an amount, with a minimum that still counts.',
  },
  {
    value: 'negative',
    title: 'Quitting',
    description: 'Not scheduled. Each finished day is marked the morning after.',
  },
]

const PERIODS: ReadonlyArray<{ value: FrequencyPeriod; label: string }> = [
  { value: 'daily', label: 'Day' },
  { value: 'weekly', label: 'Week' },
  { value: 'monthly', label: 'Month' },
  { value: 'yearly', label: 'Year' },
]

const router = useRouter()
const saveHabit = useSaveHabit()
const feedback = useFeedback()

const kind = ref<HabitKind>('completed')
const name = ref('')
const period = ref<FrequencyPeriod>('daily')
const repetitions = ref(1)
const unit = ref('')
const minimum = ref(1)
const goal = ref(2)
const error = ref<string | null>(null)

const isPositive = computed(() => kind.value !== 'negative')

function build(): Habit {
  const id = newIdentifier()
  const createdOn = todayIn()

  if (kind.value === 'negative') return createNegativeHabit({ id, name: name.value, createdOn })

  const recurrence = frequency(period.value, Number(repetitions.value))

  if (kind.value === 'measured') {
    return createMeasuredHabit({
      id,
      name: name.value,
      frequency: recurrence,
      measure: measure(unit.value, Number(minimum.value), Number(goal.value)),
      createdOn,
    })
  }

  return createCompletedHabit({ id, name: name.value, frequency: recurrence, createdOn })
}

async function submit() {
  error.value = null

  let habit: Habit

  try {
    // The domain constructors are the only validation. Duplicating their rules here would
    // let the two drift, and the form would start accepting things the model rejects.
    habit = build()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'That habit is not valid.'

    return
  }

  await saveHabit.mutateAsync(habit)
  feedback.notify(`${habit.name} created`, 'success')
  await router.push('/habits')
}
</script>

<template>
  <div class="safe-top">
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">New habit</h1>
    </header>

    <form class="space-y-5" @submit.prevent="submit">
      <fieldset>
        <legend class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          What kind
        </legend>
        <div class="space-y-2">
          <label
            v-for="option in KINDS"
            :key="option.value"
            class="flex cursor-pointer gap-3 rounded-card border p-3.5 transition-colors"
            :class="kind === option.value ? 'border-ink bg-surface' : 'border-line bg-surface'"
          >
            <input v-model="kind" type="radio" :value="option.value" class="mt-1 accent-ink" />
            <span class="flex-1">
              <span class="block text-sm font-medium text-ink">{{ option.title }}</span>
              <span class="block text-xs text-ink-muted">{{ option.description }}</span>
            </span>
          </label>
        </div>
      </fieldset>

      <div>
        <label for="habit-name" class="mb-1.5 block text-xs font-medium text-ink-muted">Name</label>
        <input
          id="habit-name"
          v-model="name"
          type="text"
          required
          :maxlength="MAX_HABIT_NAME_LENGTH"
          placeholder="Drink water"
          class="w-full rounded-cell border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle"
        />
      </div>

      <fieldset v-if="isPositive">
        <legend class="mb-1.5 text-xs font-medium text-ink-muted">How often</legend>
        <div class="flex items-center gap-2">
          <input
            v-model.number="repetitions"
            type="number"
            min="1"
            step="1"
            aria-label="Times per period"
            class="tabular w-20 rounded-cell border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
          <span class="text-sm text-ink-muted">time(s) per</span>
          <select
            v-model="period"
            aria-label="Period"
            class="flex-1 rounded-cell border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          >
            <option v-for="option in PERIODS" :key="option.value" :value="option.value">
              {{ option.label }}
            </option>
          </select>
        </div>
      </fieldset>

      <fieldset v-if="kind === 'measured'" class="space-y-3">
        <legend class="mb-1.5 text-xs font-medium text-ink-muted">How it is measured</legend>
        <input
          v-model="unit"
          type="text"
          placeholder="litres"
          aria-label="Unit"
          class="w-full rounded-cell border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle"
        />
        <div class="flex gap-2">
          <label class="flex-1 text-xs text-ink-muted">
            Minimum
            <input
              v-model.number="minimum"
              type="number"
              min="0"
              step="any"
              class="tabular mt-1 w-full rounded-cell border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            />
          </label>
          <label class="flex-1 text-xs text-ink-muted">
            Goal
            <input
              v-model.number="goal"
              type="number"
              min="0"
              step="any"
              class="tabular mt-1 w-full rounded-cell border border-line bg-surface px-3 py-2.5 text-sm text-ink"
            />
          </label>
        </div>
        <p class="text-xs text-ink-subtle">
          Reaching the minimum counts as a partial day rather than a miss.
        </p>
      </fieldset>

      <p v-if="error" role="alert" class="rounded-cell bg-relapse-soft p-3 text-xs text-relapse">
        {{ error }}
      </p>

      <div class="flex gap-2 pt-1">
        <RouterLink
          to="/habits"
          class="flex-1 rounded-full border border-line px-4 py-2.5 text-center text-sm font-medium text-ink-muted"
        >
          Cancel
        </RouterLink>
        <button
          type="submit"
          class="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-50"
          :disabled="saveHabit.isLoading.value"
        >
          <AppSpinner v-if="saveHabit.isLoading.value" :size="14" label="Saving" />
          Create
        </button>
      </div>
    </form>
  </div>
</template>
