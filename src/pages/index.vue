<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

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
import SegmentedControl, { type Segment } from '@shared/ui/SegmentedControl.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { useSwipeAction } from '@shared/ui/press/use-swipe-action'
import {
  type Achievement,
  achievementFor,
  isMeasured,
  isNegative,
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
import { type DayDuty, dutiesFor } from '@modules/planning/domain/day-agenda'
import {
  planInstance,
  type PlannedInstance,
  spanOf,
} from '@modules/planning/domain/planned-instance'
import {
  usePlannedInstances,
  useSaveInstance,
} from '@modules/planning/application/planning-queries'
import { negativeStatistics } from '@modules/stats/domain/habit-statistics'

const router = useRouter()
const { data: habitsData, isLoading: habitsLoading } = useHabits()
const { data: entriesData } = useHabitEntries()
const { data: instancesData } = usePlannedInstances()
const { data: blocksData } = useBlockTime()
const recordEntry = useRecordEntry()
const saveInstance = useSaveInstance()
const feedback = useFeedback()
const preferences = usePreferences()

const habits = computed(() => habitsData.value ?? [])
const entries = computed(() => entriesData.value ?? [])
const instances = computed(() => instancesData.value ?? [])
const blocks = computed(() => blocksData.value ?? [])

const today = todayIn()
const selectedDay = ref<CalendarDate>(today)
const weekAnchor = ref<CalendarDate>(today)
const pane = ref<'due' | 'schedule'>('due')

const weekDays = computed(() =>
  eachDayBetween(startOfWeek(weekAnchor.value), endOfWeek(weekAnchor.value)),
)

const dayLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    toDate(selectedDay.value),
  ),
)

const markedDays = computed(() => instances.value.map((instance) => instance.date))

const isFirstLoad = computed(() => habitsLoading.value && habitsData.value === undefined)
const isEmpty = computed(() => !habitsLoading.value && habits.value.length === 0)

const ACHIEVEMENT_LABEL: Record<Achievement, string> = {
  none: 'nothing yet',
  below: 'under the minimum',
  minimum: 'minimum reached',
  above: 'past the minimum',
  goal: 'goal reached',
  over: 'past the goal',
}

/** Colour follows meaning, so the same green never means two different things. */
const ACHIEVEMENT_CLASS: Record<Achievement, string> = {
  none: 'text-ink-subtle',
  below: 'text-missed',
  minimum: 'text-partial',
  above: 'text-partial',
  goal: 'text-done',
  over: 'text-done',
}

/**
 * What the day owes, joined to the verdict that currently stands for each.
 *
 * A duty may have no occurrence yet: a daily habit is due today whether or not anyone
 * dragged a card onto today. Marking one creates the occurrence on the spot.
 */
const duties = computed(() =>
  dutiesFor(habits.value, instances.value, selectedDay.value).map((duty, index) => {
    const entry = duty.instance
      ? latestEntryForInstance(entries.value, duty.instance.id)
      : undefined
    const value = entry?.value ?? 0
    const span = duty.instance ? spanOf(duty.instance) : undefined
    const measured = isMeasured(duty.habit) ? duty.habit : undefined

    return {
      key: duty.instance?.id ?? `${duty.habit.id}-${index}`,
      duty,
      habit: duty.habit,
      measured,
      entryId: entry?.id,
      outcome: entry?.outcome,
      value,
      progress: measured ? value / measured.measure.goal : entry?.outcome === 'done' ? 1 : 0,
      achievement: measured ? achievementFor(measured.measure, value) : undefined,
      span,
      time: span ? preferences.formatClock(span.start) : undefined,
    }
  }),
)

const doneCount = computed(() => duties.value.filter((row) => row.outcome === 'done').length)

/** Block time and timed duties merged into one ribbon, as the day is lived. */
const schedule = computed(() => {
  const fixed = blocksOnDate(blocks.value, selectedDay.value).map((occurrence) => ({
    kind: 'block' as const,
    key: `${occurrence.block.id}-${occurrence.segment.from}`,
    name: occurrence.block.name,
    from: occurrence.segment.from,
    to: occurrence.segment.to,
    continues: occurrence.continuesFromPreviousDay || occurrence.continuesIntoNextDay,
    style: surfaceStyle(occurrence.block),
  }))

  const timed = duties.value
    .filter((row) => row.span !== undefined)
    .map((row) => ({
      kind: 'habit' as const,
      key: row.key,
      name: row.habit.name,
      from: row.span?.start ?? 0,
      to: (row.span?.start ?? 0) + (row.duty.instance?.durationMinutes ?? 0),
      continues: false,
      style: surfaceStyle(row.habit),
    }))

  return [...fixed, ...timed].sort((left, right) => left.from - right.from)
})

const quitting = computed(() =>
  habits.value.filter(isNegative).map((habit) => {
    const stats = negativeStatistics(habit, entries.value, today)

    return { habit, streak: stats.currentCleanStreak, lastRelapse: stats.lastRelapse }
  }),
)

/** Yesterday's unanswered negative habits, which is the first thing to greet you. */
const pendingChecks = computed(() =>
  habits.value.filter(isNegative).flatMap((habit) =>
    pendingNegativeChecks(habit, entries.value, today)
      .slice(-1)
      .map((day) => ({ key: `${habit.id}-${day}`, habit, day })),
  ),
)

const segments = computed<Segment[]>(() => [
  { value: 'due', label: 'Due', badge: duties.value.length },
  { value: 'schedule', label: 'Schedule', badge: schedule.value.length },
])

/** The measured habit currently being logged, if any. */
const logging = ref<{
  habit: MeasuredHabit
  duty: DayDuty
  entryId: Identifier | undefined
  value: number
} | null>(null)

/**
 * Makes sure the duty has an occurrence to record against, creating one if it has none.
 *
 * A daily habit is due whether or not it was planned, so completing it must not require a
 * detour through the planner first.
 */
async function occurrenceFor(duty: DayDuty): Promise<PlannedInstance> {
  if (duty.instance) return duty.instance

  const created = planInstance({
    id: newIdentifier(),
    habitId: duty.habit.id,
    date: selectedDay.value,
    period: duty.habit.frequency.period,
  })

  await saveInstance.mutateAsync(created)

  return created
}

async function answerNegative(habit: NegativeHabit, day: CalendarDate, avoided: boolean) {
  await recordEntry.mutateAsync(
    recordNegative(newIdentifier(), habit, day, avoided ? 'avoided' : 'relapsed', today),
  )

  feedback.notify(
    avoided ? `${habit.name}: a clean day` : `${habit.name}: relapse recorded`,
    avoided ? 'success' : 'danger',
  )
}

/** Sets the verdict for one duty, reusing the entry so a correction replaces the answer. */
async function setCompleted(
  habit: PositiveHabit,
  duty: DayDuty,
  done: boolean,
  entryId: Identifier | undefined,
) {
  if (isMeasured(habit)) return

  const instance = await occurrenceFor(duty)

  await recordEntry.mutateAsync(
    recordCompleted(entryId ?? newIdentifier(), habit, selectedDay.value, done, {
      instanceId: instance.id,
    }),
  )
}

function startLogging(
  habit: PositiveHabit,
  duty: DayDuty,
  current: number,
  entryId: Identifier | undefined,
) {
  if (!isMeasured(habit)) return

  logging.value = { habit, duty, entryId, value: current }
}

async function saveAmount() {
  const pending = logging.value

  if (!pending) return

  logging.value = null

  try {
    const instance = await occurrenceFor(pending.duty)
    const entry = recordMeasured(
      pending.entryId ?? newIdentifier(),
      pending.habit,
      selectedDay.value,
      Number(pending.value),
      { instanceId: instance.id },
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

/**
 * Swiping right completes, swiping left takes it back.
 *
 * A measured habit has no single "done" amount to assume, so a swipe opens its sheet rather
 * than inventing a number on the user's behalf.
 */
const swipe = useSwipeAction({
  onSwipe: async (key, direction) => {
    const row = duties.value.find((candidate) => candidate.key === key)

    if (!row) return

    if (row.measured) {
      startLogging(row.habit, row.duty, row.value, row.entryId)

      return
    }

    await setCompleted(row.habit, row.duty, direction === 'right', row.entryId)
  },
})

function swipeStyle(key: string) {
  if (swipe.activeKey.value !== key || swipe.offset.value === 0) return {}

  return { transform: `translateX(${swipe.offset.value}px)` }
}

function shiftWeek(offset: number) {
  weekAnchor.value = addDays(weekAnchor.value, offset * 7)
}

function openHabit(habitId: Identifier) {
  void router.push(`/habits/${habitId}`)
}

const OUTCOME_CLASS = {
  done: 'border-done bg-done-soft text-done',
  partial: 'border-partial bg-partial-soft text-partial',
  missed: 'border-line text-ink-subtle',
} as const
</script>

<template>
  <div class="safe-top">
    <header class="flex items-baseline justify-between pt-2 pb-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-ink">Today</h1>
        <p class="text-sm text-ink-muted">{{ dayLabel }}</p>
      </div>
      <p v-if="duties.length" class="tabular text-xs text-ink-muted">
        <span class="text-base font-semibold text-ink">{{ doneCount }}</span>
        / {{ duties.length }} done
      </p>
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
      <section v-if="pendingChecks.length" class="mt-4" aria-labelledby="pending-heading">
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
            class="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card"
          >
            <span
              class="grid size-8 shrink-0 place-items-center rounded-full bg-relapse-soft text-relapse"
            >
              <AppIcon name="ban" :size="16" />
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

      <div class="mt-4">
        <SegmentedControl v-model="pane" :segments="segments" label="Day view" />
      </div>

      <section v-show="pane === 'due'" class="mt-3" aria-label="Due today">
        <TransitionGroup
          tag="ul"
          class="space-y-1.5"
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="-translate-x-3 opacity-0"
          leave-active-class="absolute transition duration-150 ease-in"
          leave-to-class="translate-x-3 opacity-0"
          move-class="transition-transform duration-200"
        >
          <li v-for="row in duties" :key="row.key" class="relative overflow-hidden rounded-card">
            <!-- Revealed as the row slides, so the gesture says what it will do. -->
            <div
              class="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-xs font-medium"
              aria-hidden="true"
            >
              <span class="flex items-center gap-1.5 text-done">
                <AppIcon name="check" :size="16" />
                Done
              </span>
              <span class="text-ink-subtle">Not yet</span>
            </div>

            <!--
              `relative` is load bearing, not layout. A positioned element paints above a
              static one regardless of DOM order, so without this the reveal layer above
              draws on top of the row instead of behind it.
            -->
            <div
              class="relative flex touch-pan-y items-center gap-3 border border-line bg-surface p-3 shadow-card transition-transform"
              :class="[
                swipe.activeKey.value === row.key ? 'duration-0' : 'duration-200',
                row.outcome === 'done' ? 'rounded-card border-done/40' : 'rounded-card',
              ]"
              :style="swipeStyle(row.key)"
              @pointerdown="swipe.press(row.key, $event)"
              @pointermove="swipe.move($event)"
              @pointerup="swipe.release($event)"
              @pointercancel="swipe.cancel()"
            >
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-3 text-left"
                :aria-label="`Open ${row.habit.name}`"
                @click="openHabit(row.habit.id)"
              >
                <span
                  v-if="row.habit.colour"
                  class="size-7 shrink-0 rounded-full"
                  :style="surfaceStyle(row.habit)"
                  aria-hidden="true"
                />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium text-ink">
                    {{ row.habit.name }}
                  </span>
                  <span class="tabular block truncate text-xs text-ink-muted">
                    <template v-if="row.measured && row.achievement">
                      {{ row.value }} / {{ row.measured.measure.goal }}
                      {{ row.measured.measure.unit }} ·
                      <span :class="ACHIEVEMENT_CLASS[row.achievement]">
                        {{ ACHIEVEMENT_LABEL[row.achievement] }}
                      </span>
                    </template>
                    <template v-else>
                      {{ row.outcome === 'done' ? 'Done' : 'Not yet' }}
                      <span v-if="row.time">· {{ row.time }}</span>
                    </template>
                  </span>
                </span>
              </button>

              <button
                v-if="row.measured"
                type="button"
                class="shrink-0"
                :aria-label="`Log ${row.habit.name}`"
                @click="startLogging(row.habit, row.duty, row.value, row.entryId)"
              >
                <ProgressRing :value="row.progress" :size="36" />
              </button>
              <button
                v-else
                type="button"
                class="grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
                :class="OUTCOME_CLASS[row.outcome ?? 'missed']"
                :aria-label="`Mark ${row.habit.name}`"
                :aria-pressed="row.outcome === 'done'"
                @click="setCompleted(row.habit, row.duty, row.outcome !== 'done', row.entryId)"
              >
                <AppIcon name="check" :size="18" />
              </button>
            </div>
          </li>
        </TransitionGroup>

        <p
          v-if="!duties.length"
          class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted"
        >
          Nothing due today.
        </p>

        <p class="mt-2 text-center text-[0.625rem] text-ink-subtle">
          Swipe a row right to complete it, left to take it back.
        </p>

        <section v-if="quitting.length" class="mt-5" aria-labelledby="quitting-heading">
          <h2
            id="quitting-heading"
            class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
          >
            Quitting
          </h2>
          <ul class="space-y-1.5">
            <li
              v-for="row in quitting"
              :key="row.habit.id"
              class="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card"
            >
              <span
                class="grid size-7 shrink-0 place-items-center rounded-full"
                :style="surfaceStyle(row.habit)"
                :class="row.habit.colour ? '' : 'bg-surface-sunken text-ink-subtle'"
              >
                <AppIcon name="ban" :size="14" />
              </span>
              <button
                type="button"
                class="min-w-0 flex-1 text-left"
                :aria-label="`Open ${row.habit.name}`"
                @click="openHabit(row.habit.id)"
              >
                <span class="block truncate text-sm font-medium text-ink">{{
                  row.habit.name
                }}</span>
                <span class="block truncate text-xs text-ink-muted">
                  Judged tomorrow morning<span v-if="row.lastRelapse">
                    · last relapse {{ row.lastRelapse }}</span
                  >
                </span>
              </button>
              <span class="shrink-0 text-right">
                <span class="tabular block text-base leading-none font-semibold text-ink">
                  {{ row.streak }}
                </span>
                <span class="block text-[0.625rem] text-ink-subtle">clean</span>
              </span>
            </li>
          </ul>
        </section>
      </section>

      <section v-show="pane === 'schedule'" class="mt-3" aria-label="Schedule">
        <ol v-if="schedule.length" class="space-y-1.5">
          <li v-for="item in schedule" :key="item.key" class="flex gap-3">
            <span
              class="tabular w-12 shrink-0 pt-2.5 text-right text-xs font-medium text-ink-subtle"
            >
              {{ preferences.formatClock(item.from) }}
            </span>
            <div
              class="flex-1 rounded-card border p-3"
              :class="
                item.kind === 'block'
                  ? 'border-transparent bg-accent text-accent-ink'
                  : 'border-line bg-surface text-ink shadow-card'
              "
              :style="item.style"
            >
              <p class="truncate text-sm font-medium">{{ item.name }}</p>
              <p class="tabular text-xs opacity-70">
                {{ preferences.formatClock(item.from) }} –
                {{ preferences.formatClock(item.to) }}
                <span v-if="item.continues">· continues</span>
              </p>
            </div>
          </li>
        </ol>
        <p
          v-else
          class="rounded-card border border-dashed border-line p-6 text-center text-sm text-ink-muted"
        >
          Nothing at a fixed time yet.
        </p>

        <RouterLink
          :to="`/day/${selectedDay}`"
          class="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-line px-4 py-2.5 text-xs font-medium text-ink-muted"
        >
          Open the timeline
          <AppIcon name="chevron-right" :size="14" />
        </RouterLink>
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
