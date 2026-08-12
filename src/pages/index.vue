<script setup lang="ts">
import { computed, ref } from 'vue'

import {
  addDays,
  type CalendarDate,
  eachDayBetween,
  endOfWeek,
  startOfWeek,
  toDate,
  todayIn,
} from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { usePreferences } from '@core/preferences-store'
import AppDialog from '@shared/ui/AppDialog.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import DateStrip from '@shared/ui/DateStrip.vue'
import ProgressRing from '@shared/ui/ProgressRing.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import {
  isMeasured,
  isNegative,
  isPositive,
  type MeasuredHabit,
  type NegativeHabit,
  type PositiveHabit,
} from '@modules/habits/domain/habit'
import {
  latestEntryForInstance,
  pendingNegativeChecks,
  recordCompleted,
  recordMeasured,
  recordNegative,
} from '@modules/habits/domain/habit-entry'
import {
  useHabitEntries,
  useHabits,
  useRecordEntry,
} from '@modules/habits/application/habit-queries'
import { blocksOnDate } from '@modules/block-time/domain/block-time'
import { useBlockTime } from '@modules/block-time/application/block-time-queries'
import { spanOf } from '@modules/planning/domain/planned-instance'
import { usePlannedInstances } from '@modules/planning/application/planning-queries'

const { data: habitsData, isLoading: habitsLoading } = useHabits()
const { data: entriesData } = useHabitEntries()
const { data: instancesData } = usePlannedInstances()
const { data: blocksData } = useBlockTime()
const recordEntry = useRecordEntry()
const feedback = useFeedback()
const preferences = usePreferences()

const habits = computed(() => habitsData.value ?? [])
const entries = computed(() => entriesData.value ?? [])
const instances = computed(() => instancesData.value ?? [])
const blocks = computed(() => blocksData.value ?? [])

const today = todayIn()
const selectedDay = ref<CalendarDate>(today)
const weekAnchor = ref<CalendarDate>(today)

const weekDays = computed(() =>
  eachDayBetween(startOfWeek(weekAnchor.value), endOfWeek(weekAnchor.value)),
)

const monthLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(
    toDate(selectedDay.value),
  ),
)

const dayLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    toDate(selectedDay.value),
  ),
)

const habitsById = computed(() => new Map(habits.value.map((habit) => [habit.id, habit])))
const markedDays = computed(() => instances.value.map((instance) => instance.date))

const isFirstLoad = computed(() => habitsLoading.value && habitsData.value === undefined)
const isEmpty = computed(() => !habitsLoading.value && habits.value.length === 0)

/**
 * Everything planned for the selected day, already joined to its habit and its latest
 * verdict, so both sections below read the same shape and record through the same handlers.
 */
const occurrences = computed(() =>
  instances.value
    .filter((instance) => instance.date === selectedDay.value)
    .flatMap((instance) => {
      const habit = habitsById.value.get(instance.habitId)

      if (!habit || !isPositive(habit)) return []

      const entry = latestEntryForInstance(entries.value, instance.id)
      const outcome = entry?.outcome
      const value = entry?.value ?? 0
      const span = spanOf(instance)

      return [
        {
          instance,
          habit,
          entryId: entry?.id,
          outcome,
          value,
          progress: isMeasured(habit) ? value / habit.measure.goal : outcome === 'done' ? 1 : 0,
          span,
        },
      ]
    }),
)

/** Block time and timed occurrences merged into one ribbon, as the day is lived. */
const schedule = computed(() => {
  const fixed = blocksOnDate(blocks.value, selectedDay.value).map((occurrence) => ({
    kind: 'block' as const,
    key: `${occurrence.block.id}-${occurrence.segment.from}`,
    name: occurrence.block.name,
    from: occurrence.segment.from,
    to: occurrence.segment.to,
    continues: occurrence.continuesFromPreviousDay || occurrence.continuesIntoNextDay,
    style: surfaceStyle(occurrence.block),
    occurrence: undefined,
  }))

  const timed = occurrences.value
    .filter((entry) => entry.span !== undefined)
    .map((entry) => ({
      kind: 'habit' as const,
      key: entry.instance.id,
      name: entry.habit.name,
      from: entry.span?.start ?? 0,
      to: (entry.span?.start ?? 0) + entry.instance.durationMinutes,
      continues: false,
      style: surfaceStyle(entry.habit),
      occurrence: entry,
    }))

  return [...fixed, ...timed].sort((left, right) => left.from - right.from)
})

const untimed = computed(() => occurrences.value.filter((entry) => entry.span === undefined))

/** Yesterday's unanswered negative habits, which is the first thing to greet you. */
const pendingChecks = computed(() =>
  habits.value.filter(isNegative).flatMap((habit) =>
    pendingNegativeChecks(habit, entries.value, today)
      .slice(-1)
      .map((day) => ({ key: `${habit.id}-${day}`, habit, day })),
  ),
)

/** The measured habit currently being logged, if any. */
const logging = ref<{
  habit: MeasuredHabit
  instanceId: Identifier
  entryId: Identifier | undefined
  value: number
} | null>(null)

async function answerNegative(habit: NegativeHabit, day: CalendarDate, avoided: boolean) {
  await recordEntry.mutateAsync(
    recordNegative(newIdentifier(), habit, day, avoided ? 'avoided' : 'relapsed', today),
  )

  feedback.notify(
    avoided ? `${habit.name}: a clean day` : `${habit.name}: relapse recorded`,
    avoided ? 'success' : 'danger',
  )
}

/**
 * Sets the verdict for one occurrence.
 *
 * The existing entry's identity is reused so a correction replaces the answer rather than
 * appending beside it. Appending was tried first and is wrong twice over: toggling a
 * checkbox a dozen times would leave a dozen rows, and two answers written in the same
 * millisecond leave "which one counts" decided by storage order, which for a UUID key is
 * effectively random.
 */
async function toggleCompleted(
  habit: PositiveHabit,
  instanceId: Identifier,
  wasDone: boolean,
  entryId: Identifier | undefined,
) {
  if (isMeasured(habit)) return

  await recordEntry.mutateAsync(
    recordCompleted(entryId ?? newIdentifier(), habit, selectedDay.value, !wasDone, {
      instanceId,
    }),
  )
}

function startLogging(
  habit: PositiveHabit,
  instanceId: Identifier,
  current: number,
  entryId: Identifier | undefined,
) {
  if (!isMeasured(habit)) return

  logging.value = { habit, instanceId, entryId, value: current }
}

async function saveAmount() {
  const pending = logging.value

  if (!pending) return

  logging.value = null

  try {
    const entry = recordMeasured(
      pending.entryId ?? newIdentifier(),
      pending.habit,
      selectedDay.value,
      Number(pending.value),
      { instanceId: pending.instanceId },
    )

    await recordEntry.mutateAsync(entry)
    feedback.notify(
      `${pending.habit.name}: ${entry.value} ${pending.habit.measure.unit}`,
      entry.outcome === 'missed' ? 'neutral' : 'success',
    )
  } catch (error) {
    feedback.notify(error instanceof Error ? error.message : 'That amount is not valid', 'danger')
  }
}

function shiftWeek(offset: number) {
  weekAnchor.value = addDays(weekAnchor.value, offset * 7)
}

const OUTCOME_CLASS = {
  done: 'border-done bg-done-soft text-done',
  partial: 'border-partial bg-partial-soft text-partial',
  missed: 'border-line text-ink-subtle',
} as const
</script>

<template>
  <div class="safe-top">
    <header class="flex items-baseline justify-between pt-2 pb-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-ink">Today</h1>
        <p class="text-sm text-ink-muted">{{ dayLabel }}</p>
      </div>
      <span
        class="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted"
      >
        {{ monthLabel }}
      </span>
    </header>

    <DateStrip
      :days="weekDays"
      :selected="selectedDay"
      :marked="markedDays"
      @select="selectedDay = $event"
      @previous="shiftWeek(-1)"
      @next="shiftWeek(1)"
    />

    <div v-if="isFirstLoad" class="mt-6 flex justify-center py-12 text-ink-subtle">
      <AppSpinner :size="24" label="Loading your day" />
    </div>

    <p
      v-else-if="isEmpty"
      class="mt-6 rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      No habits yet. Add one with the button below, or load the demo data from Settings to see how a
      full day looks.
    </p>

    <template v-else>
      <section v-if="pendingChecks.length" class="mt-6" aria-labelledby="pending-heading">
        <h2
          id="pending-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          Yesterday
        </h2>
        <ul class="space-y-2">
          <li
            v-for="check in pendingChecks"
            :key="check.key"
            class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <span
              class="grid size-9 shrink-0 place-items-center rounded-full bg-relapse-soft text-relapse"
            >
              <AppIcon name="ban" :size="18" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink">{{ check.habit.name }}</p>
              <p class="text-xs text-ink-muted">Did you avoid it?</p>
            </div>
            <div class="flex gap-1.5">
              <button
                type="button"
                class="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-ink-inverse active:scale-95"
                @click="answerNegative(check.habit, check.day, true)"
              >
                Yes
              </button>
              <button
                type="button"
                class="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-relapse"
                @click="answerNegative(check.habit, check.day, false)"
              >
                No
              </button>
            </div>
          </li>
        </ul>
      </section>

      <section class="mt-6" aria-labelledby="schedule-heading">
        <div class="mb-2 flex items-baseline justify-between">
          <h2
            id="schedule-heading"
            class="text-xs font-semibold tracking-wide text-ink-muted uppercase"
          >
            Schedule
          </h2>
          <RouterLink
            :to="`/day/${selectedDay}`"
            class="text-xs font-medium text-ink-muted underline underline-offset-2 hover:text-ink"
          >
            Open timeline
          </RouterLink>
        </div>

        <ol v-if="schedule.length" class="space-y-2">
          <li v-for="item in schedule" :key="item.key" class="flex gap-3">
            <span class="tabular w-12 shrink-0 pt-3 text-right text-xs font-medium text-ink-subtle">
              {{ preferences.formatClock(item.from) }}
            </span>
            <div
              class="flex flex-1 items-center gap-3 rounded-card border p-3.5"
              :class="
                item.kind === 'block'
                  ? 'border-transparent bg-accent text-accent-ink'
                  : 'border-line bg-surface text-ink shadow-card'
              "
              :style="item.style"
            >
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">{{ item.name }}</p>
                <p class="tabular text-xs opacity-70">
                  {{ preferences.formatClock(item.from) }} – {{ preferences.formatClock(item.to) }}
                  <span v-if="item.continues">· continues</span>
                </p>
              </div>

              <button
                v-if="item.occurrence"
                type="button"
                class="grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
                :class="OUTCOME_CLASS[item.occurrence.outcome ?? 'missed']"
                :aria-label="`Mark ${item.name}`"
                :aria-pressed="item.occurrence.outcome === 'done'"
                @click="
                  item.occurrence.habit.tracking === 'measured'
                    ? startLogging(
                        item.occurrence.habit,
                        item.occurrence.instance.id,
                        item.occurrence.value,
                        item.occurrence.entryId,
                      )
                    : toggleCompleted(
                        item.occurrence.habit,
                        item.occurrence.instance.id,
                        item.occurrence.outcome === 'done',
                        item.occurrence.entryId,
                      )
                "
              >
                <AppIcon name="check" :size="18" />
              </button>
            </div>
          </li>
        </ol>
        <p
          v-else
          class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted"
        >
          Nothing scheduled. Place a habit on this day from Plan, then give it a time.
        </p>
      </section>

      <section v-if="untimed.length" class="mt-6" aria-labelledby="anytime-heading">
        <h2
          id="anytime-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          Anytime today
        </h2>
        <ul class="space-y-2">
          <li
            v-for="entry in untimed"
            :key="entry.instance.id"
            class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
          >
            <span
              v-if="entry.habit.colour"
              class="size-8 shrink-0 rounded-full"
              :style="surfaceStyle(entry.habit)"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink">{{ entry.habit.name }}</p>
              <p v-if="entry.habit.tracking === 'measured'" class="tabular text-xs text-ink-muted">
                {{ entry.value }} / {{ entry.habit.measure.goal }} {{ entry.habit.measure.unit }}
              </p>
            </div>

            <button
              v-if="entry.habit.tracking === 'measured'"
              type="button"
              :aria-label="`Log ${entry.habit.name}`"
              @click="startLogging(entry.habit, entry.instance.id, entry.value, entry.entryId)"
            >
              <ProgressRing :value="entry.progress" />
            </button>
            <button
              v-else
              type="button"
              class="grid size-9 place-items-center rounded-full border transition-colors"
              :class="OUTCOME_CLASS[entry.outcome ?? 'missed']"
              :aria-label="`Mark ${entry.habit.name}`"
              :aria-pressed="entry.outcome === 'done'"
              @click="
                toggleCompleted(
                  entry.habit,
                  entry.instance.id,
                  entry.outcome === 'done',
                  entry.entryId,
                )
              "
            >
              <AppIcon name="check" :size="18" />
            </button>
          </li>
        </ul>
      </section>
    </template>

    <AppDialog :open="logging !== null" label="Record an amount" @dismiss="logging = null">
      <h2 class="text-base font-semibold text-ink">{{ logging?.habit.name }}</h2>
      <p class="mt-1 text-xs text-ink-muted">
        Goal {{ logging?.habit.measure.goal }} {{ logging?.habit.measure.unit }} · at least
        {{ logging?.habit.measure.minimum }} still counts as a partial day.
      </p>

      <form class="mt-4" @submit.prevent="saveAmount">
        <input
          v-if="logging"
          v-model.number="logging.value"
          type="number"
          min="0"
          step="any"
          autofocus
          :aria-label="`Amount in ${logging.habit.measure.unit}`"
          class="tabular w-full rounded-cell border border-line bg-surface px-3.5 py-3 text-lg text-ink"
        />

        <div class="mt-4 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink-muted"
            @click="logging = null"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95"
          >
            Save
          </button>
        </div>
      </form>
    </AppDialog>
  </div>
</template>
