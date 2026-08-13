<script setup lang="ts">
import { computed, ref } from 'vue'

import type { PatternName } from '@shared/domain/appearance'
import { calendarDate, todayIn, type Weekday } from '@shared/domain/calendar-date'
import type { HexColour } from '@shared/domain/colour'
import { newIdentifier } from '@shared/domain/identifier'
import AppearancePicker from '@shared/ui/AppearancePicker.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import SegmentedControl from '@shared/ui/SegmentedControl.vue'
import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  type FrequencyPeriod,
  type Habit,
  isMeasured,
  isNegative,
  MAX_HABIT_NAME_LENGTH,
  measure,
  namesItsDays,
  onWeekdays,
} from '@modules/habits/domain/habit'
import { describeFrequency } from '@modules/habits/ui/frequency-label'

const props = defineProps<{ initial?: Habit; submitLabel: string; busy: boolean }>()
const emit = defineEmits<{ submit: [habit: Habit] }>()

/**
 * The three kinds are chosen up front rather than derived from which fields got filled in.
 *
 * A habit you are building and one you are quitting are not variations of a single thing:
 * one is planned in advance, the other is judged the morning after.
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

function initialKind(): HabitKind {
  if (!props.initial) return 'completed'
  if (isNegative(props.initial)) return 'negative'

  return isMeasured(props.initial) ? 'measured' : 'completed'
}

const kind = ref<HabitKind>(initialKind())
const name = ref(props.initial?.name ?? '')
const period = ref<FrequencyPeriod>(
  props.initial && !isNegative(props.initial) ? props.initial.frequency.period : 'daily',
)
const repetitions = ref(
  props.initial && !isNegative(props.initial) ? props.initial.frequency.repetitions : 1,
)
/**
 * Counting the times or naming the days: two genuinely different plans, chosen up front.
 *
 * "Three times a week" leaves which days open, and the planner exists to settle that.
 * "Monday, Wednesday and Friday" has already settled it. Deriving the mode from whether
 * days happen to be ticked would make clearing the last day silently change what kind of
 * plan the habit is.
 */
const WEEKDAYS: ReadonlyArray<{ value: Weekday; label: string; full: string }> = [
  { value: 1, label: 'M', full: 'Monday' },
  { value: 2, label: 'T', full: 'Tuesday' },
  { value: 3, label: 'W', full: 'Wednesday' },
  { value: 4, label: 'T', full: 'Thursday' },
  { value: 5, label: 'F', full: 'Friday' },
  { value: 6, label: 'S', full: 'Saturday' },
  { value: 7, label: 'S', full: 'Sunday' },
]

const SCHEDULE_MODES = [
  { value: 'count', label: 'How many times' },
  { value: 'days', label: 'On these days' },
]

const namedDays =
  props.initial && !isNegative(props.initial) && namesItsDays(props.initial.frequency)
    ? [...props.initial.frequency.weekdays]
    : undefined

const scheduleMode = ref(namedDays ? 'days' : 'count')
const days = ref<Weekday[]>(namedDays ?? [1, 3, 5])

function toggleDay(day: Weekday) {
  days.value = days.value.includes(day)
    ? days.value.filter((candidate) => candidate !== day)
    : [...days.value, day]
}

/** Read back before saving, because a row of seven letters is not a sentence. */
const scheduleSummary = computed(() => {
  try {
    return describeFrequency(
      scheduleMode.value === 'days'
        ? onWeekdays(days.value)
        : frequency(period.value, Number(repetitions.value)),
    )
  } catch {
    return 'Pick at least one day'
  }
})

/**
 * When this started counting, which is not always when it was typed in.
 *
 * A habit you are quitting almost never begins on the day you open the app to record it: you
 * stopped on the first of the month and remembered to track it on the fourth. Without this the
 * three days in between can never be judged, because an entry before the habit existed is
 * refused — correctly, since the habit really did not exist. Moving the start is the honest
 * way to say it did.
 */
const startedOn = ref<string>(props.initial?.createdOn ?? todayIn())

const unit = ref(props.initial && isMeasured(props.initial) ? props.initial.measure.unit : '')
const minimum = ref(props.initial && isMeasured(props.initial) ? props.initial.measure.minimum : 1)
const goal = ref(props.initial && isMeasured(props.initial) ? props.initial.measure.goal : 2)
const colour = ref<HexColour | undefined>(props.initial?.colour)
const pattern = ref<PatternName | undefined>(props.initial?.pattern)
const error = ref<string | null>(null)

const isPositive = computed(() => kind.value !== 'negative')

/**
 * An example of the kind actually being created.
 *
 * A single placeholder cannot serve all three: offering "Drink water" while someone is
 * describing what they want to quit reads as the form not following along.
 */
const namePlaceholder = computed(() => {
  if (kind.value === 'negative') return 'Smoking'
  if (kind.value === 'measured') return 'Drink water'

  return 'Meditate'
})

function build(): Habit {
  // Identity and creation day survive an edit, so a habit keeps the history recorded
  // against it. Editing rebuilds through the same constructors as creating, which means
  // an edit cannot smuggle in a habit the model would have refused.
  const core = {
    id: props.initial?.id ?? newIdentifier(),
    name: name.value,
    createdOn: calendarDate(startedOn.value),
    archivedOn: props.initial?.archivedOn,
    colour: colour.value,
    pattern: pattern.value,
  }

  if (kind.value === 'negative') return createNegativeHabit(core)

  const recurrence =
    scheduleMode.value === 'days'
      ? onWeekdays(days.value)
      : frequency(period.value, Number(repetitions.value))

  if (kind.value === 'measured') {
    return createMeasuredHabit({
      ...core,
      frequency: recurrence,
      measure: measure(unit.value, Number(minimum.value), Number(goal.value)),
    })
  }

  return createCompletedHabit({ ...core, frequency: recurrence })
}

function submit() {
  error.value = null

  try {
    // The domain constructors are the only validation. Duplicating their rules here would
    // let the two drift until the form accepts habits the model rejects.
    emit('submit', build())
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'That habit is not valid.'
  }
}
</script>

<template>
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
        :placeholder="namePlaceholder"
        class="w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle"
      />
    </div>

    <label class="block text-xs font-medium text-ink-muted">
      Started
      <input
        v-model="startedOn"
        type="date"
        :max="todayIn()"
        class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm font-normal text-ink"
      />
      <span class="mt-1 block text-[0.625rem] text-ink-subtle">
        Days before this are never asked about, so move it back if you began earlier.
      </span>
    </label>

    <fieldset v-if="isPositive">
      <legend class="mb-1.5 text-xs font-medium text-ink-muted">How often</legend>

      <SegmentedControl
        v-model="scheduleMode"
        :segments="SCHEDULE_MODES"
        label="How the schedule is set"
      />

      <div v-if="scheduleMode === 'count'" class="mt-3 flex items-center gap-2">
        <input
          v-model.number="repetitions"
          type="number"
          min="1"
          step="1"
          aria-label="Times per period"
          class="tabular w-20 rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
        />
        <span class="text-sm text-ink-muted">time(s) per</span>
        <select
          v-model="period"
          aria-label="Period"
          class="flex-1 rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
        >
          <option v-for="option in PERIODS" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
      </div>

      <div v-else class="mt-3 flex gap-1.5">
        <button
          v-for="day in WEEKDAYS"
          :key="day.value"
          type="button"
          class="h-11 flex-1 rounded-cell border text-sm font-medium transition-colors"
          :class="
            days.includes(day.value)
              ? 'border-ink bg-ink text-ink-inverse'
              : 'border-line text-ink-muted'
          "
          :aria-label="day.full"
          :aria-pressed="days.includes(day.value)"
          @click="toggleDay(day.value)"
        >
          {{ day.label }}
        </button>
      </div>

      <!-- Read back in words, because a row of seven single letters is not a sentence. -->
      <p class="mt-2 text-xs text-ink-subtle">{{ scheduleSummary }}</p>
    </fieldset>

    <fieldset v-if="kind === 'measured'" class="space-y-3">
      <legend class="mb-1.5 text-xs font-medium text-ink-muted">How it is measured</legend>
      <input
        v-model="unit"
        type="text"
        placeholder="litres"
        aria-label="Unit"
        class="w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle"
      />
      <div class="flex gap-2">
        <label class="flex-1 text-xs text-ink-muted">
          Minimum
          <input
            v-model.number="minimum"
            type="number"
            min="0"
            step="any"
            class="tabular mt-1 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
          />
        </label>
        <label class="flex-1 text-xs text-ink-muted">
          Goal
          <input
            v-model.number="goal"
            type="number"
            min="0"
            step="any"
            class="tabular mt-1 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
          />
        </label>
      </div>
      <p class="text-xs text-ink-subtle">
        Reaching the minimum counts as a partial day rather than a miss.
      </p>
    </fieldset>

    <fieldset>
      <legend class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Appearance
      </legend>
      <AppearancePicker v-model:colour="colour" v-model:pattern="pattern" />
    </fieldset>

    <p v-if="error" role="alert" class="rounded-cell bg-relapse-soft p-3 text-xs text-relapse">
      {{ error }}
    </p>

    <div class="flex gap-2 pt-1">
      <RouterLink
        to="/habits"
        class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium text-ink-muted"
      >
        Cancel
      </RouterLink>
      <button
        type="submit"
        class="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-50"
        :disabled="busy"
      >
        <AppSpinner v-if="busy" :size="14" label="Saving" />
        {{ submitLabel }}
      </button>
    </div>
  </form>
</template>
