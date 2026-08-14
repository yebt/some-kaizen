<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
import { useRouter } from 'vue-router'

import {
  addDays,
  type CalendarDate,
  eachDayBetween,
  toDate,
  todayIn,
} from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { usePreferences } from '@core/preferences-store'
import ActionSheet, { type SheetAction } from '@shared/ui/ActionSheet.vue'
import AppDialog from '@shared/ui/AppDialog.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import DateStrip from '@shared/ui/DateStrip.vue'
import ProgressRing from '@shared/ui/ProgressRing.vue'
import SegmentedControl, { type Segment } from '@shared/ui/SegmentedControl.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { usePressHold } from '@shared/ui/press/use-press-hold'
import { type SwipeDirection, useSwipeAction } from '@shared/ui/press/use-swipe-action'
import {
  type Achievement,
  achievementFor,
  archiveHabit,
  type Habit,
  isMeasured,
  isNegative,
  type MeasuredHabit,
  type NegativeHabit,
  type PositiveHabit,
  type PositiveOutcome,
} from '@modules/habits/domain/habit'
import {
  latestEntryForInstance,
  pendingNegativeChecks,
  MAX_NOTE_LENGTH,
  recordCompleted,
  recordMeasured,
  recordNegative,
} from '@modules/habits/domain/habit-entry'
import {
  useArchiveHabit,
  useHabitEntries,
  useHabits,
  useRecordEntry,
  useRemoveEntry,
  useRoutines,
} from '@modules/habits/application/habit-queries'
import { blocksOnDate } from '@modules/block-time/domain/block-time'
import { useBlockTime } from '@modules/block-time/application/block-time-queries'
import { type DayDuty, dutiesFor, impliedOccurrenceId } from '@modules/planning/domain/day-agenda'
import { groupByRoutine, hasArrangement } from '@modules/planning/domain/routine-agenda'
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
const { data: routinesData } = useRoutines()
const recordEntry = useRecordEntry()
const removeEntry = useRemoveEntry()
const saveInstance = useSaveInstance()
const archive = useArchiveHabit()
const feedback = useFeedback()
const preferences = usePreferences()

const habits = computed(() => habitsData.value ?? [])
const entries = computed(() => entriesData.value ?? [])
const instances = computed(() => instancesData.value ?? [])
const blocks = computed(() => blocksData.value ?? [])
const routines = computed(() => routinesData.value ?? [])

const today = todayIn()
const selectedDay = ref<CalendarDate>(today)
const pane = ref<'due' | 'schedule'>('due')

/**
 * Every day the ribbon can reach: four months either side of today.
 *
 * Rendered whole rather than grown as it is scrolled. Extending a scroller at its edges means
 * correcting the scroll position in the same frame you add to it, and getting that a frame
 * wrong is a visible jump — a cost paid on every flick to save a few hundred buttons that
 * cost nothing. Someone who scrolls past the end has gone further than this screen is for,
 * and the day picker on the habit itself is the tool for that.
 */
const RIBBON_DAYS = 120

const ribbonDays = computed(() =>
  eachDayBetween(addDays(today, -RIBBON_DAYS), addDays(today, RIBBON_DAYS)),
)

const dayLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    toDate(selectedDay.value),
  ),
)

const markedDays = computed(() => instances.value.map((instance) => instance.date))

const isFirstLoad = computed(() => habitsLoading.value && habitsData.value === undefined)
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
      /*
       * The identity of the occurrence, whether or not one has been written yet.
       *
       * Derived rather than improvised, because it has to survive the thing being recorded.
       * Marking a habit done creates its occurrence, and a key built from `instance?.id`
       * changed at that exact moment — so Vue removed a row and inserted another instead of
       * updating one. That is the duplicate: the old row leaving, absolutely positioned and
       * sliding twelve pixels right, which is also where the page's sideways scroll came
       * from. `occurrenceFor` mints the same derived id, so the two now agree.
       */
      key:
        duty.instance?.id ??
        impliedOccurrenceId(duty.habit.id, selectedDay.value, duty.slot ?? index),
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

/**
 * The list as the reader asked to see it.
 *
 * Order is information here: with `compact`, the top of the screen is always what is still
 * owed, and what is finished sinks below it rather than disappearing — so the count still
 * adds up and a mistake is still reachable. `hide` is for someone who reads the day as a
 * queue and wants it to shorten.
 */
/**
 * True for the tick in which the selected day changes.
 *
 * Long enough for the list to be replaced without a transition, short enough that a genuine
 * creation or deletion a moment later still animates.
 */
const swappingDay = ref(false)

watch(selectedDay, async () => {
  revealingDone.value = false
  swappingDay.value = true
  await nextTick()
  swappingDay.value = false
})

/**
 * The rows still owed, always at the top.
 *
 * With the setting on `show` there is nothing to separate and the finished ones sit where
 * they are; otherwise they leave the list and become the accordion below it.
 */
const outstandingDuties = computed(() => {
  const setting = preferences.preferences.done

  if (setting === 'hide') return duties.value.filter((row) => row.outcome !== 'done')

  // `show` leaves them where they are; `at the end` moves them below the work left but keeps
  // them on screen. Only `hidden` takes them out of the list, and only then does the
  // accordion have anything to hold — the label said "at the end" and the behaviour was
  // "hidden", which is a setting lying about itself.
  if (setting === 'show') return duties.value

  return [
    ...duties.value.filter((row) => row.outcome !== 'done'),
    ...duties.value.filter((row) => row.outcome === 'done'),
  ]
})

/** Only what the list is genuinely not showing, which is the accordion's whole job. */
const finishedDuties = computed(() =>
  preferences.preferences.done === 'hide'
    ? duties.value.filter((row) => row.outcome === 'done')
    : [],
)

/**
 * The list above the divider: always and only the work still owed.
 *
 * Opening the accordion used to append the finished rows to this list, which put the divider
 * underneath everything and made it a footer rather than a seam. Two lists with the door
 * between them is what the divider was drawn to look like in the first place.
 */
const visibleDuties = computed(() => outstandingDuties.value)

/**
 * The day under its own headings, flattened back into one list.
 *
 * One list rather than a list per routine, because the row markup, the swipe, the hold and
 * the transitions all belong to it and none of them should exist twice. A heading is simply
 * another row that happens to be a heading — which is also what makes a habit moving between
 * routines an animated move rather than a disappearance and an arrival.
 *
 * Headings appear only once the day has some. A list of three rows under a single heading
 * called "anything else" is ceremony pretending to be structure.
 */
type ListRow =
  | {
      readonly kind: 'heading'
      readonly key: string
      readonly title: string
      readonly count: string
    }
  | { readonly kind: 'duty'; readonly key: string; readonly duty: (typeof duties.value)[number] }

const visibleRows = computed<ListRow[]>(() => {
  const groups = groupByRoutine(
    visibleDuties.value,
    routines.value,
    selectedDay.value,
    (row) => row.outcome === 'done',
  )

  if (!hasArrangement(groups)) {
    return visibleDuties.value.map((duty) => ({ kind: 'duty', key: duty.key, duty }))
  }

  return groups.flatMap<ListRow>((group) => [
    {
      kind: 'heading',
      key: `heading-${group.key}`,
      title: group.routine?.name ?? 'Anything else',
      count: `${group.done}/${group.total}`,
    },
    ...group.duties.map((duty) => ({ kind: 'duty' as const, key: duty.key, duty })),
  ])
})

/** Block time and timed duties merged into one ribbon, as the day is lived. */
const schedule = computed(() => {
  const fixed = blocksOnDate(blocks.value, selectedDay.value).map((occurrence) => ({
    kind: 'block' as const,
    key: `${occurrence.block.id}-${occurrence.segment.from}`,
    /** What a hold is about: the block itself, not this one appearance of it. */
    holdKey: occurrence.block.id,
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
      holdKey: row.habit.id,
      name: row.habit.name,
      from: row.span?.start ?? 0,
      to: (row.span?.start ?? 0) + (row.duty.instance?.durationMinutes ?? 0),
      continues: false,
      style: surfaceStyle(row.habit),
    }))

  return [...fixed, ...timed].sort((left, right) => left.from - right.from)
})

/**
 * Nothing to show at all, which is not the same as owning no habits.
 *
 * Block time is on this screen too, so someone who has entered their sleep and their work
 * day but no habits yet was being shown "no habits" over a schedule that already had
 * something in it — and the invitation to add a habit hid the very thing they had added.
 */
const isEmpty = computed(
  () => !habitsLoading.value && habits.value.length === 0 && schedule.value.length === 0,
)

const quitting = computed(() =>
  habits.value.filter(isNegative).map((habit) => {
    const stats = negativeStatistics(habit, entries.value, today)

    return { habit, streak: stats.currentCleanStreak, lastRelapse: stats.lastRelapse }
  }),
)

/**
 * Finished days still waiting for a verdict, yesterday first.
 *
 * Two mistakes lived here in turn. The screen used to show only the newest day, so a weekend
 * away left Friday and Saturday permanently unanswerable. Showing the oldest three instead
 * was worse: a habit created last year buried yesterday behind three hundred days nobody
 * could remember. The domain now bounds the window and answers newest first, and the screen
 * simply shows what it is given.
 */
const MAX_PENDING_SHOWN = 3

const pendingChecks = computed(() =>
  habits.value.filter(isNegative).flatMap((habit) =>
    pendingNegativeChecks(habit, entries.value, today)
      .slice(0, MAX_PENDING_SHOWN)
      .map((day) => ({ key: `${habit.id}-${day}`, habit, day })),
  ),
)

/** How many finished days are still unanswered beyond the ones being shown. */
const pendingBeyond = computed(() =>
  habits.value
    .filter(isNegative)
    .reduce(
      (total, habit) =>
        total +
        Math.max(pendingNegativeChecks(habit, entries.value, today).length - MAX_PENDING_SHOWN, 0),
      0,
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
  note: string
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
    // Derived from the slot rather than random: this is the same real event whichever
    // device notices it first, so two of them must not create two records for it.
    id: impliedOccurrenceId(duty.habit.id, selectedDay.value, duty.slot ?? 0),
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

  const existing = entryId ? entries.value.find((entry) => entry.id === entryId)?.note : undefined

  logging.value = { habit, duty, entryId, value: current, note: existing ?? '' }
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
      { instanceId: instance.id, note: pending.note },
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

    // A swipe towards the state a row is already in has nothing to do. Rightward completes and
    // leftward takes back, so the test is the direction against the outcome — not whether an
    // entry exists, which was the old check and let a second "not yet" through because the
    // first one had left a `missed` behind rather than nothing.
    if (!preferences.preferences.allowRedo && isAlready(row.outcome, direction)) {
      refuse(key)

      return
    }

    if (row.measured) {
      if (direction === 'left') {
        await clearAmount(row.measured, row.value, row.entryId)

        return
      }

      startLogging(row.habit, row.duty, row.value, row.entryId)

      return
    }

    await setCompleted(row.habit, row.duty, direction === 'right', row.entryId)
  },
})

/**
 * Takes back an amount that was already recorded, once, after asking.
 *
 * A measured habit's "not yet" is a deletion rather than a state change: there is no amount
 * that means "not started" other than none at all, so swiping it back throws away a number
 * someone typed. That deserves a question, and the question has to name the figure being
 * discarded rather than asking whether you are sure.
 */
async function clearAmount(habit: MeasuredHabit, value: number, entryId: Identifier | undefined) {
  if (!entryId || value === 0) return

  const accepted = await feedback.confirm({
    title: `Take back ${value} ${habit.measure.unit}?`,
    message: 'The amount recorded for today is removed and the habit goes back to nothing yet.',
    confirmLabel: 'Take it back',
  })

  if (!accepted) return

  await removeEntry.mutateAsync(entryId)
  feedback.notify(`${habit.name} back to nothing yet`)
}

/**
 * Holding a row opens what to do with the habit behind it.
 *
 * The same gesture the habit list already has, brought to the screen people actually live
 * on. Today is where a habit becomes annoying, so it is where you want to stop planning it,
 * fix its wording, or finally give it an hour — and walking to another screen to do that is
 * the reason nobody ever does.
 *
 * Longer than the list's hold on purpose. This row also owns a horizontal swipe, so the
 * timer has to outlast the moment of doubt at the start of a slow drag; firing at the list's
 * 180ms would turn half the swipes into a menu.
 */
const HOLD_MS = 380

type MenuTarget =
  | { kind: 'duty'; habit: PositiveHabit; duty: DayDuty }
  | { kind: 'habit'; habit: Habit }
  | { kind: 'block'; blockId: Identifier; name: string }

const menuFor = ref<MenuTarget | null>(null)

/** A hold ends with a click when the finger lifts, which would open the habit behind it. */
const swallowNextClick = ref(false)

const hold = usePressHold({
  holdMs: HOLD_MS,
  onHold: (key) => {
    const row = duties.value.find((candidate) => candidate.key === key)

    if (!row) return

    // The row is being taken over by the menu, so the half finished swipe underneath it has
    // to let go, or the row stays translated with nothing driving it.
    swipe.cancel()
    menuFor.value = { kind: 'duty', habit: row.habit, duty: row.duty }
    swallowNextClick.value = true
  },
})

function onRowClick(event: MouseEvent) {
  if (!swallowNextClick.value) return

  swallowNextClick.value = false
  event.preventDefault()
  event.stopPropagation()
}

const EDIT_ACTION: SheetAction = {
  key: 'edit',
  label: 'Edit',
  description: 'Name, frequency, colour',
}

const ARCHIVE_ACTION: SheetAction = {
  key: 'archive',
  label: 'Archive',
  description: 'Stop planning it and keep every record',
}

const menuActions = computed<SheetAction[]>(() => {
  const current = menuFor.value

  if (!current) return []

  // A block's hours belong to the block rather than to this day, and a habit you are
  // quitting is never given a time at all, so neither offers the timeline shortcut.
  if (current.kind === 'block') {
    return [{ key: 'edit-block', label: 'Edit block', description: 'Its hours and its days' }]
  }

  if (current.kind === 'habit') return [EDIT_ACTION, ARCHIVE_ACTION]

  return [
    {
      key: 'time',
      label: current.duty.instance?.startsAt === undefined ? 'Give it a time' : 'Change its time',
      description: 'Open the day timeline',
    },
    EDIT_ACTION,
    ARCHIVE_ACTION,
  ]
})

async function runMenuAction(key: string) {
  const current = menuFor.value

  menuFor.value = null

  if (!current) return

  if (current.kind === 'block') {
    await router.push(`/block-time/${current.blockId}`)

    return
  }

  if (key === 'time') {
    await router.push(`/day/${selectedDay.value}`)

    return
  }

  if (key === 'edit') {
    await router.push(`/habits/${current.habit.id}/edit`)

    return
  }

  if (key === 'archive') await onArchive(current.habit)
}

/** Held on a row that is not a duty: a habit being quit, or an item on the schedule. */
const plainHold = usePressHold({
  holdMs: HOLD_MS,
  onHold: (key) => {
    const block = blocks.value.find((candidate) => candidate.id === key)

    if (block) {
      menuFor.value = { kind: 'block', blockId: block.id, name: block.name }
      swallowNextClick.value = true

      return
    }

    // Preferred over the plain habit menu when the day actually owes this habit something:
    // from the schedule, "change its time" is the reason you held the row in the first place.
    const owed = duties.value.find((row) => row.habit.id === key)
    const found = habits.value.find((candidate) => candidate.id === key)

    if (owed) menuFor.value = { kind: 'duty', habit: owed.habit, duty: owed.duty }
    else if (found) menuFor.value = { kind: 'habit', habit: found }
    else return

    swallowNextClick.value = true
  },
})

async function onArchive(habit: Habit) {
  const accepted = await feedback.confirm({
    title: `Archive ${habit.name}?`,
    message:
      'It stops appearing here and in planning, and everything you have already recorded stays exactly as it is.',
    confirmLabel: 'Archive',
  })

  if (!accepted) return

  await archive.mutateAsync(archiveHabit(habit, today))
  feedback.notify(`${habit.name} archived`)
}

/**
 * One press, two gestures, in that order.
 *
 * They cannot be told apart at the moment the finger lands — a swipe and a hold both start
 * as a touch that has not moved — so both are armed and each disarms itself on the evidence
 * it is waiting for: the swipe when the finger travels sideways, the hold when it travels at
 * all.
 */
function onRowPress(key: string, event: PointerEvent) {
  swipe.press(key, event)
  hold.press(key, event)
}

function onRowMove(event: PointerEvent) {
  swipe.move(event)
  hold.move(event)
}

function onRowRelease(event: PointerEvent) {
  void swipe.release(event)
  hold.release(event)
}

function onRowCancel() {
  swipe.cancel()
  hold.cancel()
}

const menuTitle = computed(() => {
  const current = menuFor.value

  if (!current) return ''

  return current.kind === 'block' ? current.name : current.habit.name
})

/**
 * Answers a gesture that cannot do anything, on the row it was made on.
 *
 * A toast at the other end of the screen explains a refusal to somebody still looking at the
 * row, and by the time they read it the swipe has snapped back with nothing attached to it.
 */
/**
 * Whether a swipe is asking for the state the row is already in.
 *
 * Rightward means done, so it is refused only when the row is done. Leftward means not yet,
 * which covers both a day answered as missed and a day never answered at all — they look the
 * same on screen and taking either of them back is the same nothing.
 *
 * A partial day is neither: swiping it in either direction is a real change.
 */
function isAlready(outcome: PositiveOutcome | undefined, direction: SwipeDirection): boolean {
  return direction === 'right' ? outcome === 'done' : outcome === 'missed' || outcome === undefined
}

const refused = ref<string | null>(null)

const REFUSAL_MS = 260

function refuse(key: string) {
  refused.value = key
  window.setTimeout(() => {
    if (refused.value === key) refused.value = null
  }, REFUSAL_MS)
}

function swipeStyle(key: string) {
  if (swipe.activeKey.value !== key || swipe.offset.value === 0) return {}

  return { transform: `translateX(${swipe.offset.value}px)` }
}

/**
 * Whether the accordion of finished rows is open.
 *
 * Not a change to the setting: someone checking what they already did today has not changed
 * their mind about how the list should behave tomorrow. It closes when the day changes, which
 * is exactly as long as the question lasts.
 */
const revealingDone = ref(false)

function revealDone() {
  revealingDone.value = !revealingDone.value
}

function selectDay(day: CalendarDate) {
  selectedDay.value = day
}

const strip = useTemplateRef<{ recentre: () => void }>('strip')

/** Whether the chosen day is still somewhere on the ribbon, as the ribbon last reported. */
const selectedInView = ref(true)

/**
 * Whether there is anywhere to go back to.
 *
 * Two different ways to be lost, and only one of them used to count. Working on another day
 * is the obvious one. The other is scrolling the ribbon months away while still working on
 * today: nothing has changed, the day is right, and there is no longer anything on screen
 * that says so.
 */
const hasWandered = computed(() => selectedDay.value !== today || !selectedInView.value)

function returnToToday() {
  selectedDay.value = today
  // Asked rather than set: the ribbon's position belongs to the browser, and choosing a day
  // that is already chosen changes nothing for a watcher to react to.
  strip.value?.recentre()
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
      <div class="flex items-center gap-3">
        <p v-if="duties.length" class="tabular text-xs text-ink-muted">
          <span class="text-base font-semibold text-ink">{{ doneCount }}</span>
          / {{ duties.length }} done
        </p>

        <!--
          Beside the date rather than at the foot of the schedule. Looking at the shape of a
          day is a thing you do instead of reading the list, not after finishing it, and the
          old route there was to switch panes and scroll past everything.
        -->
        <RouterLink
          :to="`/day/${selectedDay}`"
          class="hit-area grid size-9 place-items-center rounded-full border border-line-strong text-ink-muted"
          :aria-label="`Open the timeline for ${dayLabel}`"
        >
          <AppIcon name="clock" :size="16" />
        </RouterLink>
      </div>
    </header>

    <DateStrip
      ref="strip"
      :days="ribbonDays"
      :selected="selectedDay"
      :marked="markedDays"
      @select="selectDay"
      @in-view="selectedInView = $event"
    />

    <div class="mt-1.5 flex items-center justify-center gap-3">
      <button
        v-if="hasWandered"
        type="button"
        class="rounded-full border border-line-strong px-3 py-1 text-[0.625rem] font-medium text-ink-muted"
        @click="returnToToday"
      >
        Back to today
      </button>
    </div>

    <!-- The dot has to say what it is, or it is decoration people quietly worry about. -->
    <p v-if="markedDays.length" class="mt-1.5 text-center text-[0.625rem] text-ink-subtle">
      A dot marks a day with something already on its timeline.
    </p>

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
          Still to answer
        </h2>
        <ul class="space-y-2">
          <li
            v-for="check in pendingChecks"
            :key="check.key"
            class="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card"
          >
            <span
              class="hit-area grid size-8 shrink-0 place-items-center rounded-full bg-relapse-soft text-relapse"
            >
              <AppIcon name="ban" :size="16" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink">{{ check.habit.name }}</p>
              <!--
                Which day is being answered, not just that one is. With a single question the
                answer was always "yesterday" and could be left unsaid; with several on screen
                an unlabelled Yes is a verdict about a day the reader has to guess.
              -->
              <p class="text-xs text-ink-muted">
                <span class="tabular">{{ check.day }}</span> · did you avoid it?
              </p>
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
                class="rounded-full border border-line-strong px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-relapse"
                @click="answerNegative(check.habit, check.day, false)"
              >
                No
              </button>
            </div>
          </li>
        </ul>

        <p v-if="pendingBeyond" class="mt-2 text-xs text-ink-subtle">
          {{ pendingBeyond }} older {{ pendingBeyond === 1 ? 'day is' : 'days are' }} still waiting.
          They appear as these are answered.
        </p>
      </section>

      <div class="mt-4">
        <SegmentedControl v-model="pane" :segments="segments" label="Day view" />
      </div>

      <section v-show="pane === 'due'" class="mt-3" aria-label="Due today">
        <!--
          Keyed by the day, so moving to another one replaces the list rather than animating
          across it.

          Suppressing the classes for a tick was not enough: eight entrances crossing eight
          exits still had to be scheduled and unscheduled, and anything that arrived a frame
          late showed both days at once. Replacing the whole group is atomic — the old day
          cannot be half on screen, because it is gone before the new one is built.

          Creating or deleting a habit still animates, because the key has not changed.
        -->
        <!--
          The clip and the positioning live on a container, not on the group.

          A leaving row is taken out of flow and slides twelve pixels sideways; it needs
          something positioned to be absolute against, and something to be clipped by, and
          `TransitionGroup` does not reliably carry either of those onto the tag it renders.
        -->
        <div class="relative overflow-x-clip">
          <TransitionGroup
            :key="selectedDay"
            tag="ul"
            class="space-y-1.5"
            :enter-active-class="swappingDay ? '' : 'transition duration-200 ease-out'"
            :enter-from-class="
              swappingDay ? '' : '-translate-x-3 opacity-0 motion-reduce:translate-x-0'
            "
            :leave-active-class="
              swappingDay ? '' : 'absolute inset-x-0 transition duration-150 ease-in'
            "
            :leave-to-class="
              swappingDay ? '' : 'translate-x-3 opacity-0 motion-reduce:translate-x-0'
            "
            :move-class="swappingDay ? '' : 'transition-transform duration-200'"
          >
            <li v-for="entry in visibleRows" :key="entry.key">
              <!-- A heading is another row that happens to be a heading. -->
              <div v-if="entry.kind === 'heading'" class="flex items-baseline gap-2 pt-2 pb-0.5">
                <h3 class="text-xs font-semibold tracking-wide text-ink-muted uppercase">
                  {{ entry.title }}
                </h3>
                <span class="h-px flex-1 bg-line" />
                <span class="tabular text-[0.625rem] text-ink-subtle">{{ entry.count }}</span>
              </div>

              <div
                v-else
                class="relative overflow-hidden rounded-card"
                :class="refused === entry.duty.key ? 'refuse' : ''"
              >
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
                  class="grippable relative flex touch-pan-y items-center gap-3 border border-line bg-surface p-3 shadow-card transition-transform"
                  :class="[
                    swipe.activeKey.value === entry.duty.key ? 'duration-0' : 'duration-200',
                    entry.duty.outcome === 'done' ? 'rounded-card border-done/40' : 'rounded-card',
                  ]"
                  :style="swipeStyle(entry.duty.key)"
                  @pointerdown="onRowPress(entry.duty.key, $event)"
                  @pointermove="onRowMove($event)"
                  @pointerup="onRowRelease($event)"
                  @pointercancel="onRowCancel"
                  @click="onRowClick"
                >
                  <button
                    type="button"
                    class="flex min-w-0 flex-1 items-center gap-3 text-left"
                    :aria-label="`Open ${entry.duty.habit.name}`"
                    @click="openHabit(entry.duty.habit.id)"
                  >
                    <span
                      v-if="entry.duty.habit.colour"
                      class="size-7 shrink-0 rounded-full"
                      :style="surfaceStyle(entry.duty.habit)"
                      aria-hidden="true"
                    />
                    <span class="min-w-0 flex-1">
                      <span class="block truncate text-sm font-medium text-ink">
                        {{ entry.duty.habit.name }}
                      </span>
                      <span class="tabular block truncate text-xs text-ink-muted">
                        <template v-if="entry.duty.measured && entry.duty.achievement">
                          {{ entry.duty.value }} / {{ entry.duty.measured.measure.goal }}
                          {{ entry.duty.measured.measure.unit }} ·
                          <span :class="ACHIEVEMENT_CLASS[entry.duty.achievement]">
                            {{ ACHIEVEMENT_LABEL[entry.duty.achievement] }}
                          </span>
                        </template>
                        <template v-else>
                          {{ entry.duty.outcome === 'done' ? 'Done' : 'Not yet' }}
                          <span v-if="entry.duty.time">· {{ entry.duty.time }}</span>
                        </template>
                      </span>
                    </span>
                  </button>

                  <button
                    v-if="entry.duty.measured"
                    type="button"
                    class="shrink-0"
                    :aria-label="`Log ${entry.duty.habit.name}`"
                    @click="
                      startLogging(
                        entry.duty.habit,
                        entry.duty.duty,
                        entry.duty.value,
                        entry.duty.entryId,
                      )
                    "
                  >
                    <ProgressRing :value="entry.duty.progress" :size="36" />
                  </button>
                  <button
                    v-else
                    type="button"
                    class="hit-area grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
                    :class="OUTCOME_CLASS[entry.duty.outcome ?? 'missed']"
                    :aria-label="`Mark ${entry.duty.habit.name}`"
                    :aria-pressed="entry.duty.outcome === 'done'"
                    @click="
                      setCompleted(
                        entry.duty.habit,
                        entry.duty.duty,
                        entry.duty.outcome !== 'done',
                        entry.duty.entryId,
                      )
                    "
                  >
                    <AppIcon name="check" :size="18" />
                  </button>
                </div>
              </div>
            </li>
          </TransitionGroup>
        </div>

        <!--
          A divider that is also a door. The list above is the work left; this says how much
          is behind it and opens in place, rather than a number in the header that silently
          rewrote the whole list.
        -->
        <button
          v-if="finishedDuties.length"
          type="button"
          class="mt-3 flex w-full items-center gap-3 text-xs text-ink-muted"
          :aria-expanded="revealingDone"
          @click="revealDone"
        >
          <span class="h-px flex-1 bg-line" />
          <span class="tabular">
            {{ finishedDuties.length }} done
            <AppIcon
              :name="revealingDone ? 'chevron-left' : 'chevron-right'"
              :size="12"
              class="inline align-middle"
            />
          </span>
          <span class="h-px flex-1 bg-line" />
        </button>

        <!--
          Their own list, below the seam. Sharing the list above would put a finished row back
          among the work left, which is the arrangement the setting exists to avoid.
        -->
        <ul v-if="revealingDone" class="mt-1.5 space-y-1.5">
          <li
            v-for="row in finishedDuties"
            :key="row.key"
            class="flex items-center gap-3 rounded-card border border-line bg-surface p-3 opacity-70 shadow-card"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-ink line-through">{{ row.habit.name }}</p>
              <p class="text-xs text-ink-muted">
                {{ row.measured && row.achievement ? ACHIEVEMENT_LABEL[row.achievement] : 'Done' }}
                <span v-if="row.time">· {{ row.time }}</span>
              </p>
            </div>
            <span class="grid size-8 shrink-0 place-items-center rounded-full text-done">
              <AppIcon name="check" :size="16" />
            </span>
          </li>
        </ul>

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
              class="grippable flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card"
              @pointerdown="plainHold.press(row.habit.id, $event)"
              @pointermove="plainHold.move($event)"
              @pointerup="plainHold.release($event)"
              @pointercancel="plainHold.cancel()"
              @click="onRowClick"
            >
              <span
                class="hit-area grid size-7 shrink-0 place-items-center rounded-full"
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
          <li
            v-for="item in schedule"
            :key="item.key"
            class="grippable flex gap-3"
            @pointerdown="plainHold.press(item.holdKey, $event)"
            @pointermove="plainHold.move($event)"
            @pointerup="plainHold.release($event)"
            @pointercancel="plainHold.cancel()"
            @click="onRowClick"
          >
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
          class="mt-3 flex items-center justify-center gap-1.5 rounded-full border border-line-strong px-4 py-2.5 text-xs font-medium text-ink-muted"
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
          class="tabular w-full rounded-cell border border-line-strong bg-surface px-3.5 py-3 text-lg text-ink"
        />

        <!--
          Optional, and only on the screen that already stopped to ask a question.
          A tracker that wants a sentence every morning is one nobody opens twice, so the
          note lives where the app had interrupted you anyway — never behind the swipe,
          which exists precisely so that marking a day costs nothing.
        -->
        <label v-if="logging" class="mt-3 block text-xs text-ink-muted">
          Note
          <span class="text-ink-subtle">— optional, for the day you will not remember</span>
          <textarea
            v-model="logging.note"
            rows="2"
            :maxlength="MAX_NOTE_LENGTH"
            class="mt-1.5 w-full resize-none rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink"
          />
        </label>

        <div class="mt-4 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-muted"
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
    <ActionSheet
      :open="menuFor !== null"
      :title="menuTitle"
      :actions="menuActions"
      @select="runMenuAction"
      @dismiss="menuFor = null"
    />
  </div>
</template>
