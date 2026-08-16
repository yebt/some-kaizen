<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { type CalendarDate, calendarDate, todayIn } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import { formatTime, parseTime } from '@shared/domain/time-of-day'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import BackLink from '@shared/ui/BackLink.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { usePreferences } from '@core/preferences-store'
import { useHabits, useRoutines, useSaveHabits } from '@modules/habits/application/habit-queries'
import { useBuildRoutine } from '@modules/planning/application/planning-queries'
import { cascadeFrom, stepsFor } from '@modules/planning/domain/routine-plan'

/**
 * The third way to fill a day: say when you start and how long each step takes.
 *
 * The other two place one thing at a time — drag a card onto an hour, or type an exact time
 * into one occurrence. Those are right for a day made of independent appointments. A morning
 * is not that: it is one sequence where each step starts when the last finished, so stating
 * six lengths answers six questions, and moving the wake time re-answers all of them at once.
 *
 * Deliberately not a place to reorder or add steps. The order is what the routine *is*, and
 * it is edited where the routine is edited. This screen answers when and how long.
 */
const route = useRoute('/routines/build/[id]')
const router = useRouter()
const preferences = usePreferences()
const feedback = useFeedback()

const { data: routinesData, isLoading: routinesLoading } = useRoutines()
const { data: habitsData, isLoading: habitsLoading } = useHabits()
const build = useBuildRoutine()
const saveHabits = useSaveHabits()

const routine = computed(() =>
  (routinesData.value ?? []).find((candidate) => candidate.id === route.params.id),
)

const habits = computed(() => habitsData.value ?? [])
const isLoading = computed(() => routinesLoading.value || habitsLoading.value)

/**
 * The day being filled. Not always today: tomorrow's morning is worth arranging tonight.
 *
 * Taken from the link when it carries one, which is how arriving from a day screen lands on
 * that day rather than on today. A bad value in a hand edited URL falls back to today instead
 * of leaving the field empty and the form unsubmittable.
 */
const date = ref(dayFromLink() ?? todayIn())

function dayFromLink(): CalendarDate | undefined {
  const raw = route.query.on

  if (typeof raw !== 'string') return undefined

  try {
    return calendarDate(raw)
  } catch {
    return undefined
  }
}

/**
 * Where the sequence begins.
 *
 * Seeded from the routine's own hour, which is exactly what that hour was described as: the
 * thing a builder would one day count durations forward from. Falling back to six in the
 * morning rather than to midnight, because a routine with no stated hour is far more likely
 * to be a morning than to start at 00:00.
 */
const startTime = ref('06:00')

/** Each step's length in minutes, keyed by habit, seeded from what each habit remembers. */
const lengths = ref<Record<Identifier, number>>({})

watch(
  () => routine.value,
  (current) => {
    if (!current) return

    if (current.anchorTime !== undefined) startTime.value = formatTime(current.anchorTime)
  },
  { immediate: true },
)

/** The steps as the routine describes them, before this screen's edits are laid over. */
const baseSteps = computed(() => (routine.value ? stepsFor(routine.value, habits.value) : []))

watch(
  baseSteps,
  (steps) => {
    for (const step of steps) {
      lengths.value[step.habit.id] ??= step.durationMinutes
    }
  },
  { immediate: true },
)

const steps = computed(() =>
  baseSteps.value.map((step) => ({
    ...step,
    durationMinutes: lengths.value[step.habit.id] ?? step.durationMinutes,
  })),
)

/**
 * The plan as it currently reads, recomputed on every keystroke.
 *
 * Live rather than on submit, because seeing the finish time move as you lengthen a step is
 * the entire reason to fill a day this way instead of placing six cards.
 */
const cascade = computed(() => {
  try {
    return cascadeFrom(parseTime(startTime.value), steps.value)
  } catch {
    // A half typed time is not an error to report, it is a moment mid-edit.
    return undefined
  }
})

const totalMinutes = computed(() =>
  steps.value.reduce(
    (sum, step) => sum + (Number.isFinite(step.durationMinutes) ? step.durationMinutes : 0),
    0,
  ),
)

function readableLength(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  if (!hours) return `${rest} min`

  return rest ? `${hours} h ${rest} min` : `${hours} h`
}

function setLength(habitId: Identifier, value: number) {
  // Below a minute there is no card to draw, so the field is held at one rather than allowed
  // to reach a zero the domain would refuse on submit.
  lengths.value[habitId] = Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1
}

const canBuild = computed(() => cascade.value !== undefined && cascade.value.steps.length > 0)

async function submit() {
  const plan = cascade.value
  const current = routine.value

  if (!plan || !current) return

  await build.mutateAsync({ cascade: plan, date: date.value })

  /*
   * The lengths are remembered on the habits themselves, which is what makes this screen
   * worth opening a second time. It is a statement about the habit rather than about the
   * day — stretching takes ten minutes whenever you do it — so it belongs there and not on
   * one day's occurrence, which keeps its own copy anyway.
   */
  const remembered = plan.steps
    .filter((step) => step.habit.usualDurationMinutes !== step.durationMinutes)
    .map((step) => ({ ...step.habit, usualDurationMinutes: step.durationMinutes }))

  if (remembered.length) await saveHabits.mutateAsync(remembered)

  feedback.notify(`${current.name} built into ${date.value}`, 'success')
  await router.push(`/day/${date.value}`)
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/routines" label="Routines" />

    <div
      v-if="isLoading && routine === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading the routine" />
    </div>

    <p
      v-else-if="!routine"
      class="mt-6 rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      That routine no longer exists.
    </p>

    <template v-else>
      <header class="pt-2 pb-1">
        <h1 class="text-2xl font-semibold tracking-tight text-ink">Build {{ routine.name }}</h1>
      </header>
      <p class="pb-5 text-sm text-ink-muted">
        Say when it starts and how long each step takes. Everything after a step moves with it. The
        order is the routine's own — change it where you edit the routine.
      </p>

      <form class="space-y-5" @submit.prevent="submit">
        <div class="flex gap-2">
          <label class="block flex-1 text-xs font-medium text-ink-muted">
            Starts at
            <input
              v-model="startTime"
              type="time"
              required
              aria-label="The time this routine starts"
              class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm font-normal text-ink"
            />
          </label>
          <label class="block flex-1 text-xs font-medium text-ink-muted">
            On
            <input
              v-model="date"
              type="date"
              required
              aria-label="The day to build into"
              class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm font-normal text-ink"
            />
          </label>
        </div>

        <p
          v-if="!steps.length"
          class="rounded-cell border border-dashed border-line p-4 text-xs text-ink-muted"
        >
          Nothing to build. Put some habits in this routine first and they will appear here as
          steps.
        </p>

        <ol v-else class="space-y-1.5">
          <li
            v-for="(step, index) in cascade?.steps ?? []"
            :key="step.habit.id"
            class="flex items-center gap-2 rounded-cell border border-line-strong bg-surface p-2"
            :style="surfaceStyle(step.habit)"
          >
            <span class="tabular w-12 shrink-0 text-xs font-medium text-ink">
              {{ preferences.formatClock(step.startsAt) }}
            </span>
            <span class="min-w-0 flex-1 truncate text-sm font-medium">{{ step.habit.name }}</span>
            <!--
              No `step` attribute. Paired with a minimum of one it makes the browser's own
              validity rule "1, 6, 11, 16…", which rejects an ordinary ten minutes by silently
              refusing to submit the form.
            -->
            <span class="flex shrink-0 items-center gap-1">
              <input
                :value="step.durationMinutes"
                type="number"
                min="1"
                :aria-label="`How long ${step.habit.name} takes, in minutes`"
                class="tabular w-16 rounded-cell border border-line-strong bg-surface px-2 py-1.5 text-right text-sm text-ink"
                @input="setLength(step.habit.id, Number(($event.target as HTMLInputElement).value))"
              />
              <span class="text-xs text-ink-subtle">min</span>
            </span>
            <span class="sr-only">step {{ index + 1 }}</span>
          </li>
        </ol>

        <!--
          Named rather than quietly folded onto the clock. A step running to 00:30 would be
          drawn at the very top of the same day, hours before the step it follows, which looks
          like a bug in the app rather than a routine that does not fit.
        -->
        <div
          v-if="cascade?.overflow.length"
          class="rounded-cell bg-relapse-soft p-3 text-xs text-relapse"
          role="alert"
        >
          <p class="font-medium">This runs past midnight.</p>
          <p class="mt-0.5">
            {{ cascade.overflow.map((step) => step.habit.name).join(', ') }}
            {{ cascade.overflow.length === 1 ? 'starts' : 'start' }} on the next day, so
            {{ cascade.overflow.length === 1 ? 'it stays' : 'they stay' }} unplaced. Start earlier
            or shorten a step.
          </p>
        </div>

        <p v-if="cascade && steps.length" class="text-xs text-ink-muted">
          {{ readableLength(totalMinutes) }} in all, finishing at
          <span class="tabular font-medium text-ink">{{
            preferences.formatClock(cascade.endsAt)
          }}</span
          >.
        </p>

        <div class="flex gap-2 pt-1">
          <RouterLink
            to="/routines"
            class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium text-ink-muted"
          >
            Cancel
          </RouterLink>
          <button
            type="submit"
            class="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-60"
            :disabled="build.isLoading.value || !canBuild"
          >
            <AppSpinner v-if="build.isLoading.value" :size="14" label="Building" />
            <AppIcon v-else name="check" :size="14" />
            Build the day
          </button>
        </div>
      </form>
    </template>
  </div>
</template>
