<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import BackLink from '@shared/ui/BackLink.vue'
import SegmentedControl from '@shared/ui/SegmentedControl.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { useHabits, useSaveHabit } from '@modules/habits/application/habit-queries'
import { alreadyTracked, type HabitIdea, habitFromIdea } from '@modules/habits/domain/habit-ideas'
import { HABIT_IDEAS } from '@modules/habits/domain/idea-library'

/**
 * Habits worth considering, for the moment before there are any.
 *
 * A first habit is the hardest habit: nothing on the screen yet says what this app is for, and
 * "what do you want to track" is a question you can only answer once you have seen an answer.
 *
 * What lands is ordinary — a real habit, editable and deletable at once, with no record that
 * it arrived this way. Nothing here stays a template.
 */
const router = useRouter()
const feedback = useFeedback()

const { data: habitsData, isLoading } = useHabits()
const saveHabit = useSaveHabit()

const habits = computed(() => habitsData.value ?? [])

/**
 * Which heading is showing.
 *
 * A filter rather than five stacked sections, because the whole list is thirty rows on a
 * phone and a list you scroll past is a list you do not read. The categories exist for
 * exactly this and nothing else — none of them is stored on a habit.
 */
const ALL = 'all'
const shown = ref(ALL)

const segments = computed(() => [
  { value: ALL, label: 'All' },
  ...HABIT_IDEAS.map((category) => ({ value: category.key, label: category.name })),
])

const categories = computed(() =>
  HABIT_IDEAS.filter((category) => shown.value === ALL || category.key === shown.value),
)

/** Whether something by this name is already being tracked, so the row can say so. */
function tracked(idea: HabitIdea): boolean {
  return alreadyTracked(habits.value, idea)
}

const KIND_LABEL: Record<HabitIdea['kind'], string> = {
  completed: 'Did it',
  measured: 'Measured',
  negative: 'Quitting',
}

/** How often, in the words the rest of the app uses. */
function scheduleLabel(idea: HabitIdea): string {
  if (idea.kind === 'negative') return 'judged the morning after'

  const schedule = idea.schedule

  if ('weekdays' in schedule) {
    const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

    return schedule.weekdays.map((day) => names[day - 1] ?? '?').join(' ')
  }

  const period = { daily: 'a day', weekly: 'a week', monthly: 'a month', yearly: 'a year' }[
    schedule.period
  ]

  return `${schedule.times === 1 ? 'Once' : `${schedule.times} times`} ${period}`
}

const busy = computed(() => saveHabit.isLoading.value)

async function add(idea: HabitIdea) {
  /*
   * No guard against adding one twice, because the row is the guard: an idea already tracked
   * renders as a label rather than a button, and the button that does render is disabled
   * while a save is in flight. A second check here would be a second answer to a settled
   * question, and the kind that drifts from the first one.
   */
  await saveHabit.mutateAsync(habitFromIdea(idea, { id: newIdentifier(), today: todayIn() }))
  feedback.notify(`${idea.name} added`, 'success')
}

async function done() {
  await router.push('/habits')
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/habits" label="Habits" />

    <header class="pt-2 pb-1">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Ideas</h1>
    </header>
    <p class="pb-4 text-sm text-ink-muted">
      Ordinary things a bad week can still contain. Take one and it becomes a habit like any other —
      change it, or throw it away, straight afterwards.
    </p>

    <SegmentedControl v-model="shown" :segments="segments" label="Which kind of idea" />

    <div
      v-if="isLoading && habitsData === undefined"
      class="mt-5 flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading" />
    </div>

    <template v-else>
      <section
        v-for="category in categories"
        :key="category.key"
        class="mt-5"
        :aria-label="category.name"
      >
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {{ category.name }}
        </h2>

        <ul class="space-y-2">
          <li
            v-for="idea in category.ideas"
            :key="idea.name"
            class="flex items-start gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-ink">{{ idea.name }}</p>
              <p class="mt-0.5 text-xs text-ink-muted">{{ idea.why }}</p>
              <p class="mt-1 text-[0.625rem] text-ink-subtle">
                {{ KIND_LABEL[idea.kind] }} · {{ scheduleLabel(idea) }}
              </p>
            </div>

            <!--
              Said on the row rather than found out by tapping. Someone who already reads
              should see that this one is theirs, not be told off for choosing it twice.
            -->
            <span
              v-if="tracked(idea)"
              class="shrink-0 rounded-full border border-line px-3 py-1.5 text-[0.625rem] font-medium text-ink-subtle"
            >
              Tracked
            </span>
            <button
              v-else
              type="button"
              class="hit-area shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
              :disabled="busy"
              :aria-label="`Add ${idea.name}`"
              @click="add(idea)"
            >
              <AppIcon name="plus" :size="14" />
            </button>
          </li>
        </ul>
      </section>

      <!--
        The way out, once rather than per row. Taking several is the ordinary case — this is
        the screen someone opens with nothing — so returning after each one would be the app
        deciding you were finished.
      -->
      <button
        type="button"
        class="mt-5 w-full rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse"
        @click="done"
      >
        Done
      </button>
    </template>
  </div>
</template>
