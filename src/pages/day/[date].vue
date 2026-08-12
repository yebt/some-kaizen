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
import { snapToStep, type TimeOfDay } from '@shared/domain/time-of-day'
import { usePlatform } from '@core/platform-context'
import { usePreferences } from '@core/preferences-store'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import AppDialog from '@shared/ui/AppDialog.vue'
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
const habitsById = computed(() => new Map(habits.value.map((habit) => [habit.id, habit])))
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
        Hold a card, then drop it on the hour you want. Times snap to {{ SNAP_MINUTES }} minutes.
        Tap a card to set a reminder.
      </p>

      <div class="flex">
        <!-- Hour gutter, outside the drop zone so a label never swallows a drop. -->
        <div class="w-12 shrink-0" :style="{ height: `${MINUTES_IN_DAY * PIXELS_PER_MINUTE}px` }">
          <div
            v-for="hour in hours"
            :key="hour"
            class="tabular relative text-[0.625rem] text-ink-subtle"
            :style="{ height: `${60 * PIXELS_PER_MINUTE}px` }"
          >
            <span class="absolute -top-1.5 right-2">{{ preferences.formatClock(hour * 60) }}</span>
          </div>
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

          <!-- The line the card will land on, shown before the finger commits. -->
          <div
            v-if="hoverTime !== null"
            class="pointer-events-none absolute inset-x-0 z-10 flex items-center gap-2 border-t-2 border-ink"
            :style="{ top: `${hoverTime * PIXELS_PER_MINUTE}px` }"
          >
            <span class="tabular rounded-full bg-ink px-2 py-0.5 text-[0.625rem] text-ink-inverse">
              {{ preferences.formatClock(hoverTime) }}
            </span>
          </div>

          <DraggableItem
            v-for="entry in timed"
            :key="entry.key"
            v-bind="pressState(entry.key)"
            class="absolute inset-x-1"
            :style="{ top: `${entry.top}px`, height: `${entry.height}px` }"
            @press="drag.press({ duty: entry.duty, habit: entry.habit, key: entry.key }, $event)"
            @move="trackHover($event)"
            @release="drag.release($event)"
            @cancel="drag.cancel()"
          >
            <div
              class="h-full overflow-hidden rounded-cell border border-line bg-surface px-2.5 py-1.5 shadow-card active:scale-[0.98]"
              :style="surfaceStyle(entry.habit)"
              role="button"
              :aria-label="`Adjust ${entry.habit.name}`"
              @click="openOccurrence(entry.duty.instance?.id, $event)"
            >
              <p class="flex items-center gap-1 truncate text-xs font-medium">
                <AppIcon v-if="entry.reminder !== undefined" name="bell" :size="11" />
                {{ entry.habit.name }}
              </p>
              <p class="tabular truncate text-[0.625rem] opacity-75">{{ entry.label }}</p>
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
        Drag the card to move it; the length and the reminder live here.
      </p>

      <p class="mt-4 mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
        How long
      </p>
      <div class="flex flex-wrap gap-1.5">
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
