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

/** One minute is one pixel, so the whole day is 1440px of honest, scrollable ruler. */
const PIXELS_PER_MINUTE = 1
const MINUTES_IN_DAY = 1440
/** Quarter hours: fine enough to be useful, coarse enough that a finger can hit it. */
const SNAP_MINUTES = 15

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
        top: span.start * PIXELS_PER_MINUTE,
        height: Math.max(span.durationMinutes * PIXELS_PER_MINUTE, 22),
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
    top: occurrence.segment.from * PIXELS_PER_MINUTE,
    height: (occurrence.segment.to - occurrence.segment.from) * PIXELS_PER_MINUTE,
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
  const offset = (y - element.getBoundingClientRect().top) / PIXELS_PER_MINUTE

  return snapToStep(Math.min(Math.max(offset, 0), MINUTES_IN_DAY - SNAP_MINUTES), SNAP_MINUTES)
}

async function handleDrop(payload: DragPayload, zone: string, at: DropPoint) {
  hoverTime.value = null
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
const resizing = ref<{ instanceId: Identifier; start: TimeOfDay; duration: number } | null>(null)

/** The length to draw while a resize is in flight, before anything has been saved. */
function previewDuration(instanceId: Identifier | undefined): number | undefined {
  if (!instanceId || resizing.value?.instanceId !== instanceId) return undefined

  return resizing.value.duration
}

function startResize(instance: PlannedInstance | undefined, event: PointerEvent) {
  if (!instance || instance.startsAt === undefined) return

  // Claimed here so the card underneath never begins its own press.
  event.stopPropagation()

  const target = event.currentTarget as Element & {
    setPointerCapture?: (pointerId: number) => void
  }

  target.setPointerCapture?.(event.pointerId)
  resizing.value = {
    instanceId: instance.id,
    start: instance.startsAt,
    duration: instance.durationMinutes,
  }
}

function moveResize(event: PointerEvent) {
  const current = resizing.value

  if (!current) return

  event.stopPropagation()

  const end = minutesAt(event.clientY)

  if (end === null) return

  // At least one snap step long, so a card can never be dragged into nothing.
  resizing.value = { ...current, duration: Math.max(end - current.start, SNAP_MINUTES) }
}

async function endResize(event: PointerEvent) {
  const current = resizing.value

  if (!current) return

  event.stopPropagation()
  resizing.value = null

  const existing = instances.value.find((instance) => instance.id === current.instanceId)

  if (!existing || existing.durationMinutes === current.duration) return

  await saveInstance.mutateAsync(resize(existing, current.duration))
  feedback.notify(`${current.duration} minutes`, 'success')
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

  if (current) return Math.min(current.start + current.duration, MINUTES_IN_DAY)

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
      <div class="flex gap-1">
        <RouterLink
          :to="`/day/${addDays(day, -1)}`"
          class="grid size-8 place-items-center rounded-full border border-line text-ink-muted"
          aria-label="Previous day"
        >
          <AppIcon name="chevron-left" :size="16" />
        </RouterLink>
        <RouterLink
          :to="`/day/${addDays(day, 1)}`"
          class="grid size-8 place-items-center rounded-full border border-line text-ink-muted"
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
      <section
        :data-drop-zone="TRAY_ZONE"
        class="rounded-card border border-dashed p-3 transition-colors"
        :class="
          drag.isDragging.value && drag.activeZone.value === TRAY_ZONE
            ? 'border-ink bg-accent'
            : 'border-line'
        "
        aria-labelledby="untimed-heading"
      >
        <h2
          id="untimed-heading"
          class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
        >
          Anytime today
        </h2>

        <ul v-if="untimed.length" class="flex flex-wrap gap-2">
          <li v-for="entry in untimed" :key="entry.key">
            <DraggableItem
              v-bind="pressState(entry.key)"
              @press="drag.press({ duty: entry.duty, habit: entry.habit, key: entry.key }, $event)"
              @move="trackHover($event)"
              @release="drag.release($event)"
              @cancel="drag.cancel()"
            >
              <span
                class="block rounded-full border border-line bg-surface px-3.5 py-2 text-xs font-medium text-ink shadow-card active:scale-95"
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

      <p class="mt-4 mb-2 text-xs text-ink-subtle">
        Hold a card to move it, or drag the grip on its lower edge to change how long it lasts. Both
        snap to {{ SNAP_MINUTES }} minutes — tap the time beside a card to set it to the minute.
      </p>

      <div class="flex">
        <!-- Hour gutter, outside the drop zone so a label never swallows a drop. -->
        <div
          class="relative w-14 shrink-0"
          :style="{ height: `${MINUTES_IN_DAY * PIXELS_PER_MINUTE}px` }"
        >
          <div
            v-for="hour in hours"
            :key="hour"
            class="tabular relative text-[0.625rem] text-ink-subtle"
            :style="{ height: `${60 * PIXELS_PER_MINUTE}px` }"
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
            :style="{ top: `${liveMinutes * PIXELS_PER_MINUTE}px` }"
          >
            {{ preferences.formatClock(liveMinutes) }}
          </span>
        </div>

        <div
          ref="timeline"
          :data-drop-zone="TIMELINE_ZONE"
          class="relative flex-1 rounded-card border transition-colors"
          :class="
            drag.isDragging.value && drag.activeZone.value === TIMELINE_ZONE
              ? 'border-ink'
              : 'border-line'
          "
          :style="{ height: `${MINUTES_IN_DAY * PIXELS_PER_MINUTE}px` }"
        >
          <div
            v-for="hour in hours"
            :key="hour"
            class="absolute inset-x-0 border-t border-line/60"
            :style="{ top: `${hour * 60 * PIXELS_PER_MINUTE}px` }"
          />

          <!--
            A block's length is its hours, and those belong to the block itself rather than
            to this one day, so tapping a band goes to the block instead of editing it here.
          -->
          <RouterLink
            v-for="band in bands"
            :key="band.key"
            :to="`/block-time/${band.blockId}`"
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
            :style="{ top: `${hoverTime * PIXELS_PER_MINUTE}px` }"
          />

          <DraggableItem
            v-for="entry in timed"
            :key="entry.key"
            v-bind="pressState(entry.key)"
            class="absolute inset-x-1"
            :style="{
              top: `${entry.top}px`,
              height: `${(previewDuration(entry.duty.instance?.id) ?? 0) * PIXELS_PER_MINUTE || entry.height}px`,
            }"
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
                The grip sits on the card's bottom edge and is deliberately taller than it
                looks: a five pixel target is unhittable with a thumb, so it reaches upward
                into the card while only its line is drawn.
              -->
              <span
                v-if="entry.duty.instance"
                data-resize-grip
                class="absolute inset-x-0 bottom-0 z-10 flex h-5 cursor-ns-resize touch-none items-end justify-center pb-1"
                aria-hidden="true"
                @pointerdown="startResize(entry.duty.instance, $event)"
                @pointermove="moveResize($event)"
                @pointerup="endResize($event)"
                @pointercancel="resizing = null"
                @click.stop
              >
                <span class="h-1 w-8 rounded-full bg-current opacity-40" />
              </span>
              <p class="flex items-center gap-1 truncate text-xs font-medium">
                <AppIcon v-if="entry.reminder !== undefined" name="bell" :size="11" />
                {{ entry.habit.name }}
              </p>
              <p class="tabular truncate text-[0.625rem] opacity-75">
                {{
                  previewDuration(entry.duty.instance?.id) !== undefined
                    ? `${previewDuration(entry.duty.instance?.id)} min`
                    : entry.label
                }}
              </p>
            </div>
          </DraggableItem>
        </div>
      </div>
    </template>

    <AppDialog :open="editing !== null" label="Adjust this occurrence" @dismiss="editing = null">
      <h2 class="text-base font-semibold text-ink">
        {{ timed.find((entry) => entry.duty.instance?.id === editing)?.habit.name ?? 'Occurrence' }}
      </h2>

      <p class="mb-2 text-xs text-ink-muted">
        The ruler snaps to {{ SNAP_MINUTES }} minutes. Anything finer is typed here.
      </p>

      <label class="mt-4 block text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Starts
        <input
          type="time"
          class="tabular mt-1.5 w-full rounded-cell border border-line bg-surface px-3 py-2.5 text-sm font-normal tracking-normal text-ink normal-case"
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
          class="tabular mt-1.5 w-full rounded-cell border border-line bg-surface px-3 py-2.5 text-sm text-ink"
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
            class="tabular w-24 rounded-cell border border-line bg-surface px-3 py-2.5 text-sm text-ink"
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
        class="mt-5 w-full rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink-muted"
        @click="editing = null"
      >
        Done
      </button>
    </AppDialog>

    <DragGhost
      v-if="drag.isDragging.value"
      :position="drag.position.value"
      :label="drag.payload.value?.habit.name ?? ''"
    />
  </div>
</template>
