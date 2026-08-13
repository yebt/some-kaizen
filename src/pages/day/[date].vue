<script setup lang="ts">
import { computed, ref, useTemplateRef } from 'vue'
import { useRoute } from 'vue-router'

import {
  addDays,
  type CalendarDate,
  calendarDate,
  InvalidCalendarDateError,
  toDate,
  todayIn,
} from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import {
  endOf,
  formatTime,
  parseTime,
  snapToStep,
  spanBetween,
  type TimeOfDay,
} from '@shared/domain/time-of-day'
import { usePlatform } from '@core/platform-context'
import { usePreferences } from '@core/preferences-store'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import AppDialog from '@shared/ui/AppDialog.vue'
import SegmentedControl from '@shared/ui/SegmentedControl.vue'
import DragGhost from '@shared/ui/drag/DragGhost.vue'
import DraggableItem from '@shared/ui/drag/DraggableItem.vue'
import { type DropPoint, useDragAndDrop } from '@shared/ui/drag/use-drag-and-drop'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { isPositive, type PositiveHabit } from '@modules/habits/domain/habit'
import { useHabits } from '@modules/habits/application/habit-queries'
import { blocksOnDate } from '@modules/block-time/domain/block-time'
import { type DayDuty, dutiesFor, impliedOccurrenceId } from '@modules/planning/domain/day-agenda'
import { useBlockTime } from '@modules/block-time/application/block-time-queries'
import {
  hasReminder,
  planInstance,
  type PlannedInstance,
  remindBefore,
  REMINDER_LEAD_TIMES,
  resize,
  scheduleAt,
  spanOf,
  unschedule,
  withoutReminder,
} from '@modules/planning/domain/planned-instance'
import {
  usePlannedInstances,
  useSaveInstance,
} from '@modules/planning/application/planning-queries'

const MINUTES_IN_DAY = 1440

const TIMELINE_ZONE = 'timeline'
const TRAY_ZONE = 'tray'

const route = useRoute()

/** A hand edited or stale URL should land on today rather than crash the screen. */
const day = computed<CalendarDate>(() => {
  const raw = route.params.date

  try {
    return calendarDate((Array.isArray(raw) ? raw[0] : raw) ?? '')
  } catch (error) {
    if (error instanceof InvalidCalendarDateError) return todayIn()

    throw error
  }
})

const { data: habitsData, isLoading: habitsLoading } = useHabits()
const { data: instancesData } = usePlannedInstances()
const { data: blocksData } = useBlockTime()
const saveInstance = useSaveInstance()
const feedback = useFeedback()
const preferences = usePreferences()
const platform = usePlatform()

/**
 * The ruler's scale and its step, which are one setting rather than two.
 *
 * A step has to stay big enough to aim at, so making the day taller is the only way to make
 * a drag land on something finer than a quarter hour. Zooming and precision are the same
 * knob, and pretending otherwise would offer a five minute step no finger could hit.
 */
const pixelsPerMinute = computed(() => preferences.timeline.pixelsPerMinute)
const snapMinutes = computed(() => preferences.timeline.snapMinutes)

const ZOOM_LABEL = 'Timeline detail'

const habits = computed(() => (habitsData.value ?? []).filter(isPositive))
const instances = computed(() => instancesData.value ?? [])
const blocks = computed(() => blocksData.value ?? [])

const dayLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    toDate(day.value),
  ),
)

const hours = Array.from({ length: 24 }, (_, hour) => hour)

/**
 * What the day owes, not merely what has been placed on it.
 *
 * Reading stored occurrences alone left the tray empty for every daily habit that had not
 * been ticked yet, since those have no occurrence until something is recorded — so the one
 * thing the timeline exists for, giving a habit an hour, was impossible before doing the
 * habit.
 */
const onThisDay = computed(() =>
  dutiesFor(habits.value, instances.value, day.value).map((duty, index) => ({
    duty,
    habit: duty.habit,
    key: duty.instance?.id ?? `${duty.habit.id}-slot-${duty.slot ?? index}`,
    span: duty.instance ? spanOf(duty.instance) : undefined,
  })),
)

/** Duties with no time yet. They are what the tray is for. */
const untimed = computed(() => onThisDay.value.filter((entry) => entry.span === undefined))

const timed = computed(() =>
  onThisDay.value.flatMap((entry) => {
    const span = entry.span

    if (!span) return []

    return [
      {
        ...entry,
        reminder:
          entry.duty.instance && hasReminder(entry.duty.instance)
            ? entry.duty.instance.reminderMinutesBefore
            : undefined,
        top: span.start * pixelsPerMinute.value,
        height: Math.max(span.durationMinutes * pixelsPerMinute.value, 22),
        startLabel: preferences.formatClock(span.start),
        label: `${preferences.formatClock(span.start)} – ${preferences.formatClock(span.start + span.durationMinutes)}`,
      },
    ]
  }),
)

/** Block time drawn as bands the day is built around. */
const bands = computed(() =>
  blocksOnDate(blocks.value, day.value).map((occurrence) => ({
    key: `${occurrence.block.id}-${occurrence.segment.from}`,
    blockId: occurrence.block.id,
    name: occurrence.block.name,
    top: occurrence.segment.from * pixelsPerMinute.value,
    height: (occurrence.segment.to - occurrence.segment.from) * pixelsPerMinute.value,
    continues: occurrence.continuesFromPreviousDay || occurrence.continuesIntoNextDay,
    style: surfaceStyle(occurrence.block),
  })),
)

const timeline = useTemplateRef<HTMLElement>('timeline')

interface DragPayload {
  readonly duty: DayDuty
  readonly habit: PositiveHabit
  readonly key: string
}

/**
 * Makes sure the duty has an occurrence to hang a time on, creating one if it has none.
 *
 * The identifier is derived from the slot rather than random, so two devices scheduling the
 * same unplanned duty converge on one record instead of two.
 */
async function occurrenceFor(duty: DayDuty): Promise<PlannedInstance> {
  if (duty.instance) return duty.instance

  const created = planInstance({
    id: impliedOccurrenceId(duty.habit.id, day.value, duty.slot ?? 0),
    habitId: duty.habit.id,
    date: day.value,
    period: duty.habit.frequency.period,
  })

  await saveInstance.mutateAsync(created)

  return created
}

const drag = useDragAndDrop<DragPayload>({
  onDrop: handleDrop,
  keyOf: (payload) => payload.key,
})

/** True only for the card the finger is actually on, so the day does not animate at once. */
function pressState(key: string) {
  return {
    pending: drag.isPending.value && drag.pressedKey.value === key,
    dragging: drag.isDragging.value && drag.pressedKey.value === key,
  }
}

/** Previewed while dragging so the time is visible before committing to it. */
const hoverTime = ref<number | null>(null)

function minutesAt(y: number): TimeOfDay | null {
  const element = timeline.value

  if (!element) return null

  // clientY is viewport relative and so is the rect, which makes scrolling cancel out.
  const offset = (y - element.getBoundingClientRect().top) / pixelsPerMinute.value

  const step = snapMinutes.value

  return snapToStep(Math.min(Math.max(offset, 0), MINUTES_IN_DAY - step), step)
}

async function handleDrop(payload: DragPayload, zone: string, at: DropPoint) {
  hoverTime.value = null
  slot.value = null
  swallowNextClick.value = true
  editing.value = null

  if (zone === TRAY_ZONE) {
    const existing = payload.duty.instance

    // A duty that was never placed is already "sometime today"; there is nothing to loosen.
    if (!existing || !spanOf(existing)) return

    await saveInstance.mutateAsync(unschedule(existing))
    feedback.notify(`${payload.habit.name} has no fixed time now`)

    return
  }

  const minutes = minutesAt(at.y)

  if (minutes === null) return

  const instance = await occurrenceFor(payload.duty)

  await saveInstance.mutateAsync(scheduleAt(instance, minutes))
  feedback.notify(`${payload.habit.name} at ${preferences.formatClock(minutes)}`, 'success')
}

/** The occurrence being adjusted, if any. */
const editing = ref<Identifier | null>(null)

/** Lengths worth offering. Anything finer is a drag on the ruler rather than a menu. */
const DURATIONS: readonly number[] = [15, 30, 45, 60, 90, 120]

const editingInstance = computed(() =>
  instances.value.find((instance) => instance.id === editing.value),
)

/**
 * A drag ends with a click when the finger lifts.
 *
 * Left alone it would open the reminder sheet every time a card is moved, so the click that
 * follows a real drag is swallowed.
 */
const swallowNextClick = ref(false)

/**
 * A drag on the card's bottom edge, which is how a length is changed on a phone.
 *
 * Hidden from assistive technology on purpose rather than by omission: a grip is a pointer
 * affordance, and the dialog behind a tap on the card already offers the same lengths as
 * plain buttons. Announcing a slider with no keyboard behind it would describe a control
 * that does not exist.
 *
 * A tap on the card body would have been simpler and is not reliable here: the same element
 * already owns a long press for moving the card, so the two gestures race and a tap is
 * invisible as an affordance besides. A grip you can see, on its own element, competes with
 * nothing — the parent's press never starts because the gesture is claimed here first.
 */
type Edge = 'start' | 'end'

interface Resizing {
  readonly instanceId: Identifier
  readonly edge: Edge
  /** The edge that is standing still, in minutes. Dragging one never moves the other. */
  readonly anchor: TimeOfDay
  readonly start: TimeOfDay
  readonly duration: number
}

const resizing = ref<Resizing | null>(null)

/** The span to draw while a resize is in flight, before anything has been saved. */
function preview(instanceId: Identifier | undefined): Resizing | undefined {
  if (!instanceId || resizing.value?.instanceId !== instanceId) return undefined

  return resizing.value
}

function startResize(instance: PlannedInstance | undefined, edge: Edge, event: PointerEvent) {
  if (!instance || instance.startsAt === undefined) return

  // Claimed here so the card underneath never begins its own press.
  event.stopPropagation()

  const target = event.currentTarget as Element & {
    setPointerCapture?: (pointerId: number) => void
  }

  target.setPointerCapture?.(event.pointerId)
  resizing.value = {
    instanceId: instance.id,
    edge,
    anchor:
      edge === 'end'
        ? instance.startsAt
        : ((instance.startsAt + instance.durationMinutes) as TimeOfDay),
    start: instance.startsAt,
    duration: instance.durationMinutes,
  }
}

function moveResize(event: PointerEvent) {
  const current = resizing.value

  if (!current) return

  event.stopPropagation()

  const at = minutesAt(event.clientY)

  if (at === null) return

  // The anchored edge holds still: dragging the top moves the start and leaves the finish
  // where it was, which is the opposite of dragging the bottom. Anything else means the
  // card runs away from the finger.
  const step = snapMinutes.value

  resizing.value =
    current.edge === 'end'
      ? { ...current, duration: Math.max(at - current.anchor, step) }
      : {
          ...current,
          start: Math.min(at, current.anchor - step) as TimeOfDay,
          duration: Math.max(current.anchor - at, step),
        }
}

async function endResize(event: PointerEvent) {
  const current = resizing.value

  if (!current) return

  event.stopPropagation()
  resizing.value = null

  const existing = instances.value.find((instance) => instance.id === current.instanceId)

  if (!existing) return

  const unchanged =
    existing.durationMinutes === current.duration && existing.startsAt === current.start

  if (unchanged) return

  await saveInstance.mutateAsync(resize(scheduleAt(existing, current.start), current.duration))
  feedback.notify(
    `${preferences.formatClock(current.start)} – ${preferences.formatClock(current.start + current.duration)}`,
    'success',
  )
}

/**
 * Where the card sits and how tall it is, preferring an edge that is currently being dragged.
 *
 * Computed rather than written inline: the first version fell back with `|| entry.top`, and
 * a card starting at midnight is a top of zero, which that expression quietly replaced.
 */
function cardTop(entry: { top: number; duty: DayDuty }): number {
  const current = preview(entry.duty.instance?.id)

  return current ? current.start * pixelsPerMinute.value : entry.top
}

function cardHeight(entry: { height: number; duty: DayDuty }): number {
  const current = preview(entry.duty.instance?.id)

  return current ? Math.max(current.duration * pixelsPerMinute.value, 22) : entry.height
}

/** What the card reads while an edge is being dragged, before anything is saved. */
function previewLabel(instanceId: Identifier | undefined): string | undefined {
  const current = preview(instanceId)

  if (!current) return undefined

  return `${preferences.formatClock(current.start)} – ${preferences.formatClock(current.start + current.duration)}`
}

/**
 * Where the card in the air was sitting before it was picked up.
 *
 * A day closes up behind a lifted card and leaves no trace of it, so there is nothing to
 * aim back at and no way to see what is being moved. The outline is that trace.
 */
const liftedFrom = computed(() => {
  if (!drag.isDragging.value) return undefined

  const instance = drag.payload.value?.duty.instance

  return instance ? spanOf(instance) : undefined
})

/** The footprint the card will take when it lands, drawn under the finger at real size. */
const ghostHeight = computed(() => {
  const instance = drag.payload.value?.duty.instance
  const minutes = instance?.durationMinutes ?? DEFAULT_DURATION_MINUTES

  return minutes * pixelsPerMinute.value
})

/**
 * An hour claimed before anything has been chosen to fill it.
 *
 * The reverse of dragging a habit onto a time, and the order people actually think in when
 * the constraint is the calendar rather than the habit: this hour is free, what goes in it?
 */
const slot = ref<{ start: TimeOfDay; duration: number } | null>(null)

const DEFAULT_DURATION_MINUTES = 30

function openSlot(event: MouseEvent) {
  if (swallowNextClick.value) {
    swallowNextClick.value = false

    return
  }

  // A tap that landed on a card, a band or a grip is not a tap on an empty hour.
  if ((event.target as Element).closest('[data-occupied]')) return

  const start = minutesAt(event.clientY)

  if (start === null) return

  slot.value = { start, duration: DEFAULT_DURATION_MINUTES }
}

async function fillSlot(duty: DayDuty) {
  const current = slot.value

  slot.value = null

  if (!current) return

  const instance = await occurrenceFor(duty)

  await saveInstance.mutateAsync(resize(scheduleAt(instance, current.start), current.duration))
  feedback.notify(`${duty.habit.name} at ${preferences.formatClock(current.start)}`, 'success')
}

function openOccurrence(instanceId: Identifier | undefined, event: MouseEvent) {
  if (swallowNextClick.value) {
    swallowNextClick.value = false
    event.preventDefault()

    return
  }

  if (instanceId) editing.value = instanceId
}

async function chooseDuration(minutes: number) {
  const existing = editingInstance.value

  if (!existing) return

  await saveInstance.mutateAsync(resize(existing, minutes))
  feedback.notify(`${minutes} minutes`, 'success')
}

/**
 * Two honest ways of saying the same thing, because a plan is held in one of two shapes.
 *
 * "Gym from seven to eight" and "gym at seven for an hour" describe the same block of the
 * day. Offering only one of them means doing arithmetic in your head to enter something you
 * already knew, and the answer you type is the one you get wrong.
 */
const lengthMode = ref('duration')

const LENGTH_MODES = [
  { value: 'duration', label: 'For how long' },
  { value: 'end', label: 'Until' },
]

/** `HH:mm`, which is what a time input reads and writes whatever the locale draws. */
const startValue = computed(() => {
  const start = editingInstance.value?.startsAt

  return start === undefined ? '' : formatTime(start)
})

const endValue = computed(() => {
  const span = editingInstance.value ? spanOf(editingInstance.value) : undefined

  return span ? formatTime(endOf(span)) : ''
})

/**
 * Reads a time field, ignoring anything that is not a time yet.
 *
 * A field being cleared or half typed fires the same event as a finished one, and writing
 * that would overwrite a plan while its owner is still in the middle of entering it.
 */
function readTime(event: Event): TimeOfDay | null {
  try {
    return parseTime((event.target as HTMLInputElement).value)
  } catch {
    return null
  }
}

async function setStart(event: Event) {
  const existing = editingInstance.value
  const start = readTime(event)

  if (!existing || start === null) return

  await saveInstance.mutateAsync(scheduleAt(existing, start))
  feedback.notify(`Starts at ${preferences.formatClock(start)}`, 'success')
}

async function setEnd(event: Event) {
  const existing = editingInstance.value
  const end = readTime(event)

  if (!existing || end === null || existing.startsAt === undefined) return

  // An end at or before the start reads as the following morning, the same rule block time
  // uses, so a habit running past midnight can be entered rather than refused.
  await chooseDuration(spanBetween(existing.startsAt, end).durationMinutes)
}

async function setDuration(event: Event) {
  const minutes = Number((event.target as HTMLInputElement).value)

  if (!Number.isFinite(minutes) || minutes < 1) return

  await chooseDuration(Math.round(minutes))
}

/**
 * The moment the hour column should call out while a gesture is still in flight.
 *
 * A badge floating over the timeline covers the very card it describes. The hour column is
 * already where the eye goes to read a time, so the live reading belongs there, beside the
 * fixed hours it is refining.
 */
const liveMinutes = computed<number | null>(() => {
  const current = resizing.value

  if (current) {
    return current.edge === 'end'
      ? Math.min(current.start + current.duration, MINUTES_IN_DAY)
      : current.start
  }

  return hoverTime.value
})

async function chooseReminder(key: string) {
  const existing = editingInstance.value

  if (!existing) return

  if (key === 'none') {
    await saveInstance.mutateAsync(withoutReminder(existing))
    feedback.notify('Reminder removed')

    return
  }

  const minutes = Number(key)

  await saveInstance.mutateAsync(remindBefore(existing, minutes))

  // Asked the first time a reminder is actually set. Being asked "can this app notify you?"
  // before showing any interest in being notified is how an app earns a permanent no.
  const permission = await platform.reminders.ensurePermission()

  if (permission === 'unsupported') {
    feedback.notify('Saved. Reminders only ring in the installed app.')

    return
  }

  if (permission === 'denied') {
    feedback.notify('Saved, but notifications are turned off for this app.', 'danger')

    return
  }

  feedback.notify(
    minutes === 0 ? 'Reminder set for the start' : `Reminder set ${minutes} minutes before`,
    'success',
  )
}

function trackHover(event: PointerEvent) {
  drag.move(event)

  hoverTime.value =
    drag.isDragging.value && drag.activeZone.value === TIMELINE_ZONE
      ? minutesAt(event.clientY)
      : null
}
</script>

<template>
  <div class="safe-top">
    <header class="flex items-baseline justify-between pt-2 pb-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-ink">Day</h1>
        <p class="text-sm text-ink-muted">{{ dayLabel }}</p>
      </div>
      <div class="flex gap-3">
        <RouterLink
          :to="`/day/${addDays(day, -1)}`"
          class="hit-area grid size-8 place-items-center rounded-full border border-line-strong text-ink-muted"
          aria-label="Previous day"
        >
          <AppIcon name="chevron-left" :size="16" />
        </RouterLink>
        <RouterLink
          :to="`/day/${addDays(day, 1)}`"
          class="hit-area grid size-8 place-items-center rounded-full border border-line-strong text-ink-muted"
          aria-label="Next day"
        >
          <AppIcon name="chevron-right" :size="16" />
        </RouterLink>
      </div>
    </header>

    <div
      v-if="habitsLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading the day" />
    </div>

    <template v-else>
      <!--
        The tray folds away the moment a card leaves it.

        It is a staging area, not a permanent feature of the day: while something is in the
        air the only thing worth looking at is the hours it can land on, and on a phone the
        tray was eating the top third of them. Collapsed rather than hidden, so it is still
        a target to drop back onto.
      -->
      <section
        :data-drop-zone="TRAY_ZONE"
        class="overflow-hidden rounded-card border border-dashed transition-all duration-200"
        :class="[
          drag.isDragging.value && drag.activeZone.value === TRAY_ZONE
            ? 'border-ink bg-accent'
            : 'border-line',
          drag.isDragging.value ? 'max-h-14 p-2 opacity-70' : 'max-h-64 p-3',
        ]"
        aria-labelledby="untimed-heading"
      >
        <h2
          id="untimed-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          {{ drag.isDragging.value ? 'Drop here to loosen it' : 'Anytime today' }}
        </h2>

        <ul v-if="untimed.length" class="flex snap-x gap-2 overflow-x-auto pb-1">
          <li v-for="entry in untimed" :key="entry.key" class="shrink-0 snap-start">
            <DraggableItem
              v-bind="pressState(entry.key)"
              @press="drag.press({ duty: entry.duty, habit: entry.habit, key: entry.key }, $event)"
              @move="trackHover($event)"
              @release="drag.release($event)"
              @cancel="drag.cancel()"
            >
              <span
                class="block rounded-full border border-line-strong bg-surface px-3.5 py-2 text-xs font-medium text-ink shadow-card active:scale-95"
                :style="surfaceStyle(entry.habit)"
              >
                {{ entry.habit.name }}
              </span>
            </DraggableItem>
          </li>
        </ul>
        <p v-else class="text-xs text-ink-subtle">
          Everything has a time. Drag a card back here to loosen it.
        </p>
      </section>

      <div class="mt-4 mb-2 flex items-end justify-between gap-3">
        <p class="text-xs text-ink-subtle">
          Hold a card to move it, drag a corner to change when it starts or ends, or tap an empty
          hour to claim it. Everything snaps to {{ snapMinutes }} minutes — tap the time beside a
          card to set it to the minute.
        </p>

        <!--
          Stretching the day is how a step gets smaller, so the readout names the step rather
          than the zoom: what changes here is what you can actually save, and a magnifying
          glass would only have promised a better view.
        -->
        <div
          class="flex shrink-0 items-center gap-1 rounded-full border border-line-strong p-1"
          role="group"
          :aria-label="ZOOM_LABEL"
        >
          <button
            type="button"
            class="hit-area grid size-7 place-items-center rounded-full text-ink-muted disabled:opacity-30"
            aria-label="Wider view, coarser steps"
            :disabled="preferences.preferences.timeline === 'coarse'"
            @click="preferences.zoomTimeline(-1)"
          >
            <AppIcon name="minus" :size="14" />
          </button>
          <span class="tabular w-12 text-center text-[0.625rem] text-ink-muted">
            {{ snapMinutes }} min
          </span>
          <button
            type="button"
            class="hit-area grid size-7 place-items-center rounded-full text-ink-muted disabled:opacity-30"
            aria-label="Closer view, finer steps"
            :disabled="preferences.preferences.timeline === 'fine'"
            @click="preferences.zoomTimeline(1)"
          >
            <AppIcon name="plus" :size="14" />
          </button>
        </div>
      </div>

      <!--
        Bled to the edges of the screen. The timeline is the one surface here whose value is
        proportional to its area, and the page's reading margins were spending a tenth of
        every hour on whitespace beside a ruler.
      -->
      <div class="-mx-4 flex">
        <!-- Hour gutter, outside the drop zone so a label never swallows a drop. -->
        <div
          class="relative w-11 shrink-0"
          :style="{ height: `${MINUTES_IN_DAY * pixelsPerMinute}px` }"
        >
          <div
            v-for="hour in hours"
            :key="hour"
            class="tabular relative text-[0.625rem] text-ink-subtle"
            :style="{ height: `${60 * pixelsPerMinute}px` }"
          >
            <span class="absolute -top-1.5 right-2">{{ preferences.formatClock(hour * 60) }}</span>
          </div>

          <!--
            A marker per placed occurrence, level with the top edge of its card.
            It is the precise counterpart to the two gestures: the ruler snaps to a quarter
            hour, and a plan that does not fall on a quarter hour is entered from here.
          -->
          <button
            v-for="entry in timed"
            :key="`marker-${entry.key}`"
            type="button"
            class="tabular absolute right-1 z-20 -translate-y-1/2 rounded-full bg-ink px-1.5 py-0.5 text-[0.5625rem] font-medium text-ink-inverse shadow-card"
            :style="{ top: `${entry.top}px` }"
            :aria-label="`Set the exact time of ${entry.habit.name}`"
            @click="editing = entry.duty.instance?.id ?? null"
          >
            {{ entry.startLabel }}
          </button>

          <!-- Where the finger is right now: the landing time, or the end being dragged out. -->
          <span
            v-if="liveMinutes !== null"
            data-live-time
            class="tabular pointer-events-none absolute right-1 z-30 -translate-y-1/2 rounded-full bg-accent px-1.5 py-0.5 text-[0.5625rem] font-semibold text-ink shadow-card"
            :style="{ top: `${liveMinutes * pixelsPerMinute}px` }"
          >
            {{ preferences.formatClock(liveMinutes) }}
          </span>
        </div>

        <div
          ref="timeline"
          :data-drop-zone="TIMELINE_ZONE"
          class="relative mr-2 flex-1 rounded-card border transition-colors"
          :class="
            drag.isDragging.value && drag.activeZone.value === TIMELINE_ZONE
              ? 'border-ink'
              : 'border-line'
          "
          :style="{ height: `${MINUTES_IN_DAY * pixelsPerMinute}px` }"
          @click="openSlot"
        >
          <div
            v-for="hour in hours"
            :key="hour"
            class="absolute inset-x-0 border-t border-line/60"
            :style="{ top: `${hour * 60 * pixelsPerMinute}px` }"
          />

          <!--
            A block's length is its hours, and those belong to the block itself rather than
            to this one day, so tapping a band goes to the block instead of editing it here.
          -->
          <RouterLink
            v-for="band in bands"
            :key="band.key"
            :to="`/block-time/${band.blockId}`"
            data-occupied
            class="absolute inset-x-0 bg-accent/70 px-2 py-1"
            :style="{ top: `${band.top}px`, height: `${band.height}px`, ...band.style }"
          >
            <p class="text-[0.625rem] font-medium">
              {{ band.name }}<span v-if="band.continues"> ·</span>
            </p>
          </RouterLink>

          <!--
            The line the card will land on. The time itself is read off the hour column, so
            the badge that used to sit here no longer covers the card it is describing.
          -->
          <div
            v-if="hoverTime !== null"
            class="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-ink"
            :style="{ top: `${hoverTime * pixelsPerMinute}px` }"
          />

          <!--
            Where the card came from, held open while it is in the air.
            Without it the day closes up behind the finger and there is no way to tell what
            has been picked up, or to put it back where it was.
          -->
          <div
            v-if="liftedFrom"
            class="pointer-events-none absolute inset-x-1 rounded-cell border border-dashed border-line-strong"
            :style="{
              top: `${liftedFrom.start * pixelsPerMinute}px`,
              height: `${liftedFrom.durationMinutes * pixelsPerMinute}px`,
            }"
            aria-hidden="true"
          />

          <!-- An hour claimed before anything has been decided to fill it. -->
          <div
            v-if="slot"
            data-empty-slot
            data-occupied
            class="absolute inset-x-1 z-20 flex items-center justify-center rounded-cell border-2 border-dashed border-ink bg-accent/40"
            :style="{
              top: `${slot.start * pixelsPerMinute}px`,
              height: `${slot.duration * pixelsPerMinute}px`,
            }"
          >
            <span class="tabular text-[0.625rem] font-medium text-ink">
              {{ preferences.formatClock(slot.start) }} · pick a habit
            </span>
          </div>

          <DraggableItem
            v-for="entry in timed"
            :key="entry.key"
            v-bind="pressState(entry.key)"
            data-occupied
            class="absolute inset-x-1"
            :style="{ top: `${cardTop(entry)}px`, height: `${cardHeight(entry)}px` }"
            @press="drag.press({ duty: entry.duty, habit: entry.habit, key: entry.key }, $event)"
            @move="trackHover($event)"
            @release="drag.release($event)"
            @cancel="drag.cancel()"
          >
            <div
              class="relative h-full overflow-hidden rounded-cell border border-line bg-surface px-2.5 py-1.5 shadow-card active:scale-[0.98]"
              :style="surfaceStyle(entry.habit)"
              role="button"
              :aria-label="`Adjust ${entry.habit.name}`"
              @click="openOccurrence(entry.duty.instance?.id, $event)"
            >
              <!--
                Two contact points, at the corners a right hand reaches first, with the whole
                middle of the card left to move it. One grip could only ever change the
                length; moving the start without moving the finish needs its own edge.

                Each is deliberately larger than it is drawn: a nine pixel dot is unhittable
                with a thumb, so the touchable square reaches into the card while only the
                dot is painted.
              -->
              <span
                v-for="edge in entry.duty.instance ? (['start', 'end'] as const) : []"
                :key="edge"
                data-resize-grip
                :data-edge="edge"
                class="absolute z-10 flex size-7 cursor-ns-resize touch-none items-center justify-center"
                :class="edge === 'start' ? '-top-1 -left-1' : '-right-1 -bottom-1'"
                aria-hidden="true"
                @pointerdown="startResize(entry.duty.instance, edge, $event)"
                @pointermove="moveResize($event)"
                @pointerup="endResize($event)"
                @pointercancel="resizing = null"
                @click.stop
              >
                <span class="size-2.5 rounded-full border-2 border-current bg-surface" />
              </span>
              <p class="flex items-center gap-1 truncate text-xs font-medium">
                <AppIcon v-if="entry.reminder !== undefined" name="bell" :size="11" />
                {{ entry.habit.name }}
              </p>
              <p class="tabular truncate text-[0.625rem] opacity-75">
                {{ previewLabel(entry.duty.instance?.id) ?? entry.label }}
              </p>
            </div>
          </DraggableItem>
        </div>
      </div>
    </template>

    <!--
      Cancelled by tapping anywhere outside it, which is the gesture everyone tries first on
      something provisional. A slot is a question, not a record: nothing is written until a
      habit is chosen for it, so backing out has to cost nothing.
    -->
    <AppDialog
      :open="slot !== null"
      :label="slot ? `What happens at ${preferences.formatClock(slot.start)}?` : ''"
      @dismiss="slot = null"
    >
      <h2 class="text-base font-semibold text-ink">
        {{ slot ? preferences.formatClock(slot.start) : '' }}
      </h2>
      <p class="mb-3 text-xs text-ink-muted">
        {{ DEFAULT_DURATION_MINUTES }} minutes, adjustable once it is there.
      </p>

      <ul v-if="untimed.length" class="space-y-1.5">
        <li v-for="entry in untimed" :key="entry.key">
          <button
            type="button"
            class="w-full rounded-cell border border-line-strong bg-surface px-3.5 py-3 text-left text-sm font-medium text-ink"
            :style="surfaceStyle(entry.habit)"
            @click="fillSlot(entry.duty)"
          >
            {{ entry.habit.name }}
          </button>
        </li>
      </ul>
      <p v-else class="rounded-cell border border-dashed border-line p-4 text-xs text-ink-muted">
        Everything the day owes already has a time. Loosen one back to the tray to put it somewhere
        else.
      </p>

      <button
        type="button"
        class="mt-4 w-full rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-muted"
        @click="slot = null"
      >
        Cancel
      </button>
    </AppDialog>

    <AppDialog :open="editing !== null" label="Adjust this occurrence" @dismiss="editing = null">
      <h2 class="text-base font-semibold text-ink">
        {{ timed.find((entry) => entry.duty.instance?.id === editing)?.habit.name ?? 'Occurrence' }}
      </h2>

      <p class="mb-2 text-xs text-ink-muted">
        The ruler snaps to {{ snapMinutes }} minutes. Anything finer is typed here.
      </p>

      <label class="mt-4 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Starts
        <input
          type="time"
          class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm font-normal tracking-normal text-ink normal-case"
          :value="startValue"
          @change="setStart"
        />
      </label>

      <div class="mt-3">
        <SegmentedControl
          v-model="lengthMode"
          :segments="LENGTH_MODES"
          label="How the end is set"
        />
      </div>

      <label v-if="lengthMode === 'end'" class="mt-3 block text-xs text-ink-muted">
        Ends
        <input
          type="time"
          class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
          :value="endValue"
          @change="setEnd"
        />
      </label>

      <template v-else>
        <label class="mt-3 flex items-center gap-2 text-xs text-ink-muted">
          <input
            type="number"
            min="1"
            step="5"
            aria-label="Minutes"
            class="tabular w-24 rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
            :value="editingInstance?.durationMinutes"
            @change="setDuration"
          />
          minutes
        </label>

        <div class="mt-2 flex flex-wrap gap-1.5">
          <button
            v-for="minutes in DURATIONS"
            :key="minutes"
            type="button"
            class="tabular rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
            :class="
              editingInstance?.durationMinutes === minutes
                ? 'border-ink bg-ink text-ink-inverse'
                : 'border-line text-ink-muted'
            "
            :aria-pressed="editingInstance?.durationMinutes === minutes"
            @click="chooseDuration(minutes)"
          >
            {{ minutes }} min
          </button>
        </div>
      </template>

      <p class="mt-4 mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Remind me
      </p>
      <div class="flex flex-wrap gap-1.5">
        <button
          v-for="minutes in REMINDER_LEAD_TIMES"
          :key="minutes"
          type="button"
          class="tabular rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            editingInstance?.reminderMinutesBefore === minutes
              ? 'border-ink bg-ink text-ink-inverse'
              : 'border-line text-ink-muted'
          "
          :aria-pressed="editingInstance?.reminderMinutesBefore === minutes"
          @click="chooseReminder(String(minutes))"
        >
          {{ minutes === 0 ? 'At the time' : `${minutes} before` }}
        </button>
        <button
          type="button"
          class="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            editingInstance?.reminderMinutesBefore === undefined
              ? 'border-ink bg-ink text-ink-inverse'
              : 'border-line text-ink-muted'
          "
          :aria-pressed="editingInstance?.reminderMinutesBefore === undefined"
          @click="chooseReminder('none')"
        >
          None
        </button>
      </div>

      <button
        type="button"
        class="mt-5 w-full rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-muted"
        @click="editing = null"
      >
        Done
      </button>
    </AppDialog>

    <DragGhost
      v-if="drag.isDragging.value"
      :position="drag.position.value"
      :label="drag.payload.value?.habit.name ?? ''"
      :height="ghostHeight"
      :detail="hoverTime === null ? undefined : preferences.formatClock(hoverTime)"
    />
  </div>
</template>
