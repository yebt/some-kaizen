<script setup lang="ts">
import { computed, ref, shallowRef, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

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
import BackLink from '@shared/ui/BackLink.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import AppDialog from '@shared/ui/AppDialog.vue'
import SegmentedControl from '@shared/ui/SegmentedControl.vue'
import DragGhost from '@shared/ui/drag/DragGhost.vue'
import DraggableItem from '@shared/ui/drag/DraggableItem.vue'
import { type DropPoint, type PointerLike, useDragAndDrop } from '@shared/ui/drag/use-drag-and-drop'
import { tick } from '@core/haptics'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { useSwipePage } from '@shared/ui/press/use-swipe-page'
import { isPositive, type PositiveHabit } from '@modules/habits/domain/habit'
import { useHabits, useRoutines } from '@modules/habits/application/habit-queries'
import { blocksOnDate } from '@modules/block-time/domain/block-time'
import {
  type DayDuty,
  dutiesFor,
  impliedOccurrenceId,
  spanFor,
} from '@modules/planning/domain/day-agenda'
import { carryPlan, sourceDayFor } from '@modules/planning/domain/carried-plan'
import { groupByRoutine, hasArrangement } from '@modules/planning/domain/routine-agenda'
import { useBlockTime } from '@modules/block-time/application/block-time-queries'
import {
  hasReminder,
  planFor,
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
  useCarryPlan,
  usePlannedInstances,
  useRemoveInstance,
  useSaveInstance,
} from '@modules/planning/application/planning-queries'

const MINUTES_IN_DAY = 1440

const TIMELINE_ZONE = 'timeline'
const TRAY_ZONE = 'tray'

const route = useRoute()
const router = useRouter()

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
const { data: routinesData } = useRoutines()
const saveInstance = useSaveInstance()
const removeInstance = useRemoveInstance()
const carry = useCarryPlan()
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
const routines = computed(() => routinesData.value ?? [])

const dayLabel = computed(() =>
  new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
    toDate(day.value),
  ),
)

const hours = Array.from({ length: 24 }, (_, hour) => hour)

/**
 * The day this one could copy, when there is one worth copying.
 *
 * Offered rather than applied. A planner that fills days on its own is one you stop trusting
 * about the past, because you can no longer tell what you decided from what it assumed.
 */
const carryFrom = computed(() => sourceDayFor(day.value, instances.value))

const carryable = computed(() =>
  carryFrom.value === undefined
    ? undefined
    : carryPlan({
        from: carryFrom.value,
        to: day.value,
        habits: habits.value,
        instances: instances.value,
      }),
)

const carryLabel = computed(() =>
  carryFrom.value === undefined
    ? ''
    : new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(
        toDate(carryFrom.value),
      ),
)

async function bringPlanForward() {
  const plan = carryable.value

  if (!plan?.carried.length) return

  const dropped = plan.dropped.length
    ? ` ${plan.dropped.map((habit) => habit.name).join(', ')} ${
        plan.dropped.length === 1 ? 'does not' : 'do not'
      } belong on this day, so ${plan.dropped.length === 1 ? 'it stays' : 'they stay'} out.`
    : ''

  const kept = plan.kept.length ? ` Everything already on this day is left as it is.` : ''

  const accepted = await feedback.confirm({
    title: `Bring ${carryLabel.value} here?`,
    message: `${plan.carried.length} ${
      plan.carried.length === 1 ? 'habit arrives' : 'habits arrive'
    } at the times they had.${dropped}${kept}`,
    confirmLabel: 'Bring it',
  })

  if (!accepted) return

  await carry.mutateAsync(plan.carried)
  feedback.notify('Plan brought forward', 'success')
}

/**
 * What the day owes, not merely what has been placed on it.
 *
 * Reading stored occurrences alone left the tray empty for every daily habit that had not
 * been ticked yet, since those have no occurrence until something is recorded — so the one
 * thing the timeline exists for, giving a habit an hour, was impossible before doing the
 * habit.
 */
const liveAgenda = computed(() =>
  dutiesFor(habits.value, instances.value, day.value).map((duty, index) => ({
    duty,
    habit: duty.habit,
    // The derived identity of this occurrence, so a key cannot change the moment one is
    // written. See the same decision on Today.
    key: duty.instance?.id ?? impliedOccurrenceId(duty.habit.id, day.value, duty.slot ?? index),
    span: spanFor(duty),
  })),
)

/**
 * The day, held still while something is being carried.
 *
 * Every query in this app refetches on any write, and a refetch hands back `undefined` for a
 * moment before the rows arrive. That blink empties the list, Vue removes the element the
 * finger is holding, and the pointer capture dies with it: the drag reports nothing further
 * and the card is left wherever it was. Rare enough to look random and certain enough to
 * happen, since a drop is itself a write.
 *
 * Freezing is also the truthful behaviour. A list that reorders under a finger already
 * carrying one of its rows is answering a question nobody asked.
 *
 * Deliberately not covered by a test. jsdom has no pointer capture — an event dispatched on a
 * detached node still runs its listeners — so a test for this passes whether or not the
 * freeze exists, which is worse than no test at all. It needs a real browser.
 */
const frozenAgenda = shallowRef<ReturnType<typeof liveAgenda.value.slice> | null>(null)

const onThisDay = computed(() => frozenAgenda.value ?? liveAgenda.value)

function holdAgendaStill() {
  frozenAgenda.value = liveAgenda.value
}

function letAgendaMove() {
  frozenAgenda.value = null
}

/** Duties with no time yet. They are what the tray is for. */
const untimed = computed(() => onThisDay.value.filter((entry) => entry.span === undefined))

/** A heading is another row that happens to be a heading, as it is on Today. */
type TrayRow =
  | {
      readonly kind: 'heading'
      readonly key: string
      readonly title: string
      readonly count: number
      readonly at?: string
    }
  | { readonly kind: 'chip'; readonly key: string; readonly entry: (typeof untimed.value)[number] }

/**
 * The tray, under the routines its chips belong to.
 *
 * The ruler itself cannot be grouped — a card is where its hour puts it, and a heading has no
 * hour — so the tray is where an arrangement can show on this screen at all. It earns its
 * place here more than anywhere: filling a day means asking "what happens in the morning",
 * and a flat bag of a dozen chips makes that a question you answer from memory.
 *
 * Counted by total rather than done out of total. Every chip in here is by definition without
 * a time, so a `[0/4]` on each heading would be four zeroes saying nothing.
 */
const trayRows = computed<TrayRow[]>(() => {
  const groups = groupByRoutine(untimed.value, routines.value, day.value, () => false)

  // Nothing arranged means no headings, not a single heading called "everything".
  if (!hasArrangement(groups)) {
    return untimed.value.map((entry) => ({ kind: 'chip', key: entry.key, entry }))
  }

  return groups.flatMap<TrayRow>((group) => [
    {
      kind: 'heading',
      key: `heading-${group.key}`,
      title: group.routine?.name ?? 'Anything else',
      count: group.total,
      ...(group.routine?.anchorTime === undefined
        ? {}
        : { at: preferences.formatClock(group.routine.anchorTime) }),
    },
    ...group.duties.map((entry) => ({ kind: 'chip' as const, key: entry.key, entry })),
  ])
})

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
  /**
   * How far down its own card the finger landed, in minutes.
   *
   * Without it the drop puts the card's *top* where the finger is, so grabbing a ninety
   * minute card by its middle threw it forty five minutes later than where it was let go.
   * The card appeared to jump the moment it was picked up and to have been edited before
   * anything was dragged.
   */
  readonly grabbedAt: number
}

interface Liftable {
  readonly duty: DayDuty
  readonly habit: PositiveHabit
  readonly key: string
}

/** Picks a card up off the ruler, keeping the finger's place on it and its measured box. */
function liftCard(entry: Liftable, event: PointerEvent) {
  holdAgendaStill()
  drag.press(
    {
      duty: entry.duty,
      habit: entry.habit,
      key: entry.key,
      grabbedAt: grabOffset(entry.duty, event),
    },
    event,
  )
  measureGhost(entry.duty)
}

/** A chip in the drawer has no position on the ruler yet, so there is nothing to keep hold of. */
function liftChip(entry: Liftable, event: PointerEvent) {
  holdAgendaStill()
  drag.press({ duty: entry.duty, habit: entry.habit, key: entry.key, grabbedAt: 0 }, event)
  measureGhost(entry.duty)
}

/** A release outside any zone never reaches the drop handler, so it thaws the day here. */
async function releaseCard(event: PointerEvent) {
  await drag.release(event)
  forgetLift()
}

function abandonLift() {
  drag.cancel()
  forgetLift()
}

/**
 * Clears everything a lift put on screen, whatever ended it.
 *
 * There are three ways a gesture stops and only one of them used to tidy up. A drop cleared
 * the guide line, the gutter marker and the ghost; a release onto nothing and a
 * `pointercancel` cleared none of them — and `pointercancel` is exactly what the browser
 * sends when it decides the gesture was a scroll after all. The leftovers were a time marker
 * and a line drawn across the day, pointing at an hour nothing had been moved to.
 */
function forgetLift() {
  hoverTime.value = null
  ghostBox.value = null
  letAgendaMove()
}

/** Where inside its own card a press landed, so the card can be carried rather than reset. */
function grabOffset(duty: DayDuty, event: PointerLike): number {
  const span = spanFor(duty)

  if (!span) return 0

  const at = minutesAt(event.clientY)

  if (at === null) return 0

  // Clamped to the card: a press cannot have landed outside the thing it picked up, and a
  // stale scroll position must not turn into a wild offset.
  return Math.min(Math.max(at - span.start, 0), span.durationMinutes)
}

/**
 * The occurrence a duty hangs a time on, built if it has none yet.
 *
 * Deliberately does not save. Every caller immediately changes what it gets back — a start, a
 * length, a reminder — and writing the blank one first made two records' worth of writes for
 * one gesture, with a moment in between where the day showed an occurrence nobody asked for.
 *
 * The identifier is derived from the slot rather than random, so two devices scheduling the
 * same unplanned duty converge on one record instead of two.
 */
function occurrenceOf(duty: DayDuty): PlannedInstance {
  return (
    duty.instance ??
    planFor(duty.habit, {
      id: impliedOccurrenceId(duty.habit.id, day.value, duty.slot ?? 0),
      date: day.value,
    })
  )
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

/**
 * Dragging the day sideways moves to the next or previous one.
 *
 * Only from empty canvas. A gesture that started on a card belongs to the card, which is
 * already carrying a drag and two resize edges — three gestures on one press is how a
 * timeline stops being predictable.
 */
const pageSwipe = useSwipePage({
  onSwipe: (direction) => {
    void router.push(`/day/${addDays(day.value, direction === 'right' ? -1 : 1)}`)
  },
})

function startPageSwipe(event: PointerEvent) {
  if ((event.target as Element).closest('[data-occupied]')) return

  pageSwipe.press(event)
}

/**
 * Whether the drawer of unplaced habits is open.
 *
 * Shut by default. The list of things without an hour is a tool for the moment you decide to
 * place one, not a permanent feature of looking at a day.
 */
const trayOpen = ref(false)

/**
 * Where the card being carried would start, if it were let go now.
 *
 * The single answer to that question. It used to be asked twice — the gutter read the
 * finger's own time while the drop subtracted where the card had been grabbed — so the
 * indicator said six o'clock and the card landed at five. Two expressions for one fact will
 * always drift; the only fix that holds is that there is one expression.
 */
const hoverTime = ref<number | null>(null)

/**
 * The start a drop at this height would produce, with the finger keeping its place on the
 * card it picked up.
 *
 * `grabbedAt` is how far down the card the press landed. Subtracting it is what stops a card
 * grabbed by its middle from jumping so that its top edge sits under the finger.
 */
function landingTime(clientY: number, grabbedAt: number): TimeOfDay | null {
  const element = timeline.value

  if (!element) return null

  const offset = (clientY - element.getBoundingClientRect().top) / pixelsPerMinute.value
  const step = snapMinutes.value

  return snapToStep(Math.min(Math.max(offset - grabbedAt, 0), MINUTES_IN_DAY - step), step)
}

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
  ghostBox.value = null
  // Released before the write, so the day shows what was actually saved rather than the
  // snapshot it was frozen at.
  letAgendaMove()
  slot.value = null
  swallowNextClick.value = true
  editing.value = null

  if (zone === TRAY_ZONE) {
    // A duty with no time at all is already "sometime today"; there is nothing to loosen.
    // One drawn at its habit's usual hour does have a time, and taking it away is a real
    // thing to record — "not at the usual hour today" is a statement about this day only.
    if (!spanFor(payload.duty)) return

    await saveInstance.mutateAsync(unschedule(occurrenceOf(payload.duty)))
    feedback.notify(`${payload.habit.name} has no fixed time now`)

    return
  }

  // Exactly what the gutter has been showing. Anything computed a second time here is a
  // second opinion, and the one on screen is the one that was agreed to.
  const minutes = landingTime(at.y, payload.grabbedAt)

  if (minutes === null) return

  await saveInstance.mutateAsync(scheduleAt(occurrenceOf(payload.duty), minutes))
  // The drawer was open to hand this over, and it has. Reopening onto a day it no longer has
  // anything to say about is the app answering a question that was already settled.
  trayOpen.value = false
  feedback.notify(`${payload.habit.name} at ${preferences.formatClock(minutes)}`, 'success')
}

/**
 * The occurrence being adjusted, held by its identity rather than by its record.
 *
 * A card drawn at its habit's usual hour has no record yet, and opening a sheet on it must
 * not create one: a curious tap would leave an occurrence behind. The identity is the same
 * either way, so the sheet can read a duty that exists only as a plan and write it the
 * moment something is actually changed.
 */
const editing = ref<Identifier | null>(null)

/** Lengths worth offering. Anything finer is a drag on the ruler rather than a menu. */
const DURATIONS: readonly number[] = [15, 30, 45, 60, 90, 120]

const editingEntry = computed(() => timed.value.find((entry) => entry.key === editing.value))

const editingInstance = computed(() => {
  const entry = editingEntry.value

  return entry ? occurrenceOf(entry.duty) : undefined
})

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
  /** The occurrence's identity, derived when it has no record of its own yet. */
  readonly key: Identifier
  readonly duty: DayDuty
  readonly edge: Edge
  /** The edge that is standing still, in minutes. Dragging one never moves the other. */
  readonly anchor: TimeOfDay
  readonly start: TimeOfDay
  readonly duration: number
}

const resizing = ref<Resizing | null>(null)

/** The span to draw while a resize is in flight, before anything has been saved. */
function preview(key: Identifier): Resizing | undefined {
  return resizing.value?.key === key ? resizing.value : undefined
}

function startResize(entry: { key: Identifier; duty: DayDuty }, edge: Edge, event: PointerEvent) {
  const span = spanFor(entry.duty)

  // Nothing to stretch on a duty with no hour. Reached through the grips, which are only
  // drawn on a card that has one, so this is a guard rather than a branch.
  if (!span) return

  // Claimed here so the card underneath never begins its own press.
  event.stopPropagation()

  const target = event.currentTarget as Element & {
    setPointerCapture?: (pointerId: number) => void
  }

  target.setPointerCapture?.(event.pointerId)
  resizing.value = {
    key: entry.key,
    duty: entry.duty,
    edge,
    anchor: edge === 'end' ? span.start : ((span.start + span.durationMinutes) as TimeOfDay),
    start: span.start,
    duration: span.durationMinutes,
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

  // A card sitting at its habit's usual hour has no record until something is changed about
  // it, and stretching it is exactly such a change.
  const existing = occurrenceOf(current.duty)

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
function cardTop(entry: { top: number; key: Identifier }): number {
  const current = preview(entry.key)

  return current ? current.start * pixelsPerMinute.value : entry.top
}

function cardHeight(entry: { height: number; key: Identifier }): number {
  const current = preview(entry.key)

  return current ? Math.max(current.duration * pixelsPerMinute.value, 22) : entry.height
}

/** What the card reads while an edge is being dragged, before anything is saved. */
function previewLabel(key: Identifier): string | undefined {
  const current = preview(key)

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

/**
 * The rectangle the carried card occupied, measured from the ruler rather than guessed.
 *
 * Read once when the drag begins. Measuring it every frame would let a card that scrolls or
 * a ruler that rescales change the shape of a thing already in the air.
 */
const ghostBox = shallowRef<{ width: number; left: number; height: number } | null>(null)

function measureGhost(duty: DayDuty) {
  const element = timeline.value

  if (!element) return

  const rect = element.getBoundingClientRect()
  const minutes = duty.instance?.durationMinutes ?? DEFAULT_DURATION_MINUTES

  // Inset by the same amount the cards are, so the ghost sits exactly where it will land.
  const inset = 4

  ghostBox.value = {
    left: rect.left + inset,
    width: Math.max(rect.width - inset * 2, 0),
    height: Math.max(minutes * pixelsPerMinute.value, 22),
  }
}

/** Where on the ghost the finger is, in pixels, so its top does not leap upward on pick-up. */
const grabbedOffset = computed(() => (drag.payload.value?.grabbedAt ?? 0) * pixelsPerMinute.value)

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

/**
 * Takes a habit off the day from the drawer, rather than only from the ruler.
 *
 * The drawer holds what the day owes and has not placed. Some of that is not going to happen,
 * and the only way to say so was to place it first and then loosen it — asking someone to
 * schedule a thing in order to cancel it.
 */
async function dropChip(duty: DayDuty) {
  const existing = duty.instance

  if (!existing) {
    feedback.notify('This one is owed by the habit itself. Archive the habit to stop it.')

    return
  }

  await removeInstance.mutateAsync(existing.id)
  feedback.notify(`${duty.habit.name} is off today`)
}

async function fillSlot(duty: DayDuty) {
  const current = slot.value

  slot.value = null

  if (!current) return

  await saveInstance.mutateAsync(
    resize(scheduleAt(occurrenceOf(duty), current.start), current.duration),
  )
  feedback.notify(`${duty.habit.name} at ${preferences.formatClock(current.start)}`, 'success')
}

function openOccurrence(key: Identifier, event: MouseEvent) {
  if (swallowNextClick.value) {
    swallowNextClick.value = false
    event.preventDefault()

    return
  }

  // A sheet takes over from whatever gesture opened it. The press that produced this tap
  // froze the day so it could not change under a moving finger, and the release that would
  // have thawed it never arrives once a modal is up — leaving the day showing a snapshot of
  // itself, which is the card that stays behind after its hour is taken away.
  abandonLift()
  editing.value = key
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

/**
 * Returns the occurrence to "sometime today" from its own sheet.
 *
 * Loosening was only reachable by dragging the card onto a strip that appears while a drag is
 * already under way, which is a gesture you have to already know. A card you have tapped is a
 * card you are looking at, and this is the one thing about it the sheet could not say.
 */
async function loosenEditing() {
  const existing = editingInstance.value

  editing.value = null
  // Belt as well as braces: whatever the sheet does, the day is free to move again.
  forgetLift()

  if (!existing) return

  await saveInstance.mutateAsync(unschedule(existing))
  feedback.notify(`${habitFor(existing)?.name ?? 'It'} has no fixed time now`)
}

/** The habit an occurrence belongs to, for a message that can name it. */
function habitFor(instance: PlannedInstance): PositiveHabit | undefined {
  return habits.value.find((habit) => habit.id === instance.habitId)
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

  const carried = drag.payload.value
  const previous = hoverTime.value

  hoverTime.value =
    carried && drag.isDragging.value && drag.activeZone.value === TIMELINE_ZONE
      ? landingTime(event.clientY, carried.grabbedAt)
      : null

  // The same detent language as the day strip: a tick when the card crosses onto a new step,
  // once per crossing rather than once per frame.
  if (hoverTime.value !== null && hoverTime.value !== previous) tick()
}
</script>

<template>
  <div class="safe-top">
    <header class="flex items-baseline justify-between pt-2 pb-4">
      <div>
        <!-- The tab bar is hidden here, so the way back has to be visible rather than known. -->
        <BackLink to="/" label="Today" />
        <h1 class="mt-1 text-2xl font-semibold tracking-tight text-ink">Day</h1>
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

    <!--
      Offered only when there is genuinely something to bring, and named rather than hinted.
      A permanent button would be one more thing to ignore; a line that appears on exactly the
      days it applies to teaches the feature at the moment it is useful, and takes itself away
      once the day has been arranged.
    -->
    <div
      v-if="carryable?.carried.length"
      class="mb-4 flex items-center gap-3 rounded-card border border-line bg-surface p-3"
    >
      <div class="min-w-0 flex-1">
        <p class="text-xs font-medium text-ink">{{ carryLabel }} was arranged.</p>
        <p class="text-[0.625rem] text-ink-muted">
          Bring it here and
          {{
            carryable.carried.length === 1
              ? '1 habit arrives'
              : `${carryable.carried.length} habits arrive`
          }}
          at the times they had.
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full border border-line-strong px-3.5 py-2 text-xs font-medium text-ink disabled:opacity-60"
        :disabled="carry.isLoading.value"
        @click="bringPlanForward"
      >
        Bring it
      </button>
    </div>

    <div
      v-if="habitsLoading && habitsData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading the day" />
    </div>

    <template v-else>
      <!--
        A drawer that stays shut until it is wanted.

        Open by default it did two things wrong at once: it sat on top of the tab bar, and on
        a day with eight unplaced habits it covered the hours they were meant to go on. Shut,
        it is a count you can ignore; open, it is a list you asked for. Either way it takes no
        layout space, so opening it moves nothing behind it — which is what made the old
        collapsing panel shift the ruler out from under the finger.
      -->
      <!--
        The dim lifts the instant a chip leaves, and the drawer itself stays mounted.

        Closing the drawer on pick-up was the obvious move and it broke the gesture outright:
        the chip lives inside the drawer and holds the pointer capture, so unmounting it
        destroyed the element every later move and the release were being reported to. The
        drawer slides away instead — off screen, still listening.
      -->
      <div
        v-if="trayOpen && !drag.isDragging.value"
        class="fixed inset-0 z-40 bg-canvas/60 backdrop-blur-sm"
        aria-hidden="true"
        @click="trayOpen = false"
      />

      <div
        v-if="untimed.length"
        class="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md px-4 pb-4 transition-transform duration-200"
        :class="drag.isDragging.value ? 'translate-y-full' : 'translate-y-0'"
      >
        <div
          v-show="trayOpen"
          :data-drop-zone="TRAY_ZONE"
          class="rounded-card border border-dashed border-line-strong bg-surface p-3 shadow-float"
        >
          <div class="mb-2 flex items-baseline justify-between">
            <h2 class="text-xs font-semibold tracking-wide text-ink-muted uppercase">
              Anytime today
              <span class="tabular ml-1 font-normal text-ink-subtle">{{ untimed.length }}</span>
            </h2>
            <button
              type="button"
              class="text-[0.625rem] text-ink-muted underline-offset-2 hover:underline"
              @click="trayOpen = false"
            >
              close
            </button>
          </div>

          <!--
            Scrolls rather than grows. A day can genuinely owe a dozen habits, and a drawer
            that keeps growing eats the ruler it exists to fill — which is the one thing it
            must never do, since the ruler is where the chips are going.
          -->
          <!--
            A heading is another item in the same wrapping row, made full width so the chips
            after it start a line of their own. Keeping one list rather than a list of lists
            is what lets the chips stay exactly the draggable elements they already were.
          -->
          <ul class="flex max-h-[45vh] flex-wrap gap-2 overflow-y-auto overscroll-contain">
            <li
              v-for="row in trayRows"
              :key="row.key"
              :class="row.kind === 'heading' && 'basis-full'"
            >
              <div v-if="row.kind === 'heading'" class="flex items-baseline gap-2 pt-1">
                <h3 class="text-[0.625rem] font-semibold tracking-wide text-ink-muted uppercase">
                  {{ row.title }}
                </h3>
                <span v-if="row.at" class="tabular text-[0.625rem] text-ink-subtle">
                  {{ row.at }}
                </span>
                <span class="h-px flex-1 bg-line" />
                <span class="tabular text-[0.625rem] text-ink-subtle">{{ row.count }}</span>
              </div>

              <DraggableItem
                v-else
                v-bind="pressState(row.entry.key)"
                claim
                @press="liftChip(row.entry, $event)"
                @move="trackHover($event)"
                @release="releaseCard($event)"
                @cancel="abandonLift"
              >
                <span
                  class="flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-3 py-2 text-xs font-medium text-ink shadow-card active:scale-95"
                  :style="surfaceStyle(row.entry.habit)"
                >
                  {{ row.entry.habit.name }}
                  <button
                    type="button"
                    class="hit-area -mr-1 grid size-5 place-items-center rounded-full text-current opacity-50"
                    :aria-label="`Take ${row.entry.habit.name} off today`"
                    @pointerdown.stop
                    @click.stop="dropChip(row.entry.duty)"
                  >
                    <AppIcon name="ban" :size="12" />
                  </button>
                </span>
              </DraggableItem>
            </li>
          </ul>
          <p class="mt-2 text-center text-[0.625rem] text-ink-subtle">hold one to place it</p>
        </div>

        <button
          v-show="!trayOpen"
          type="button"
          class="mx-auto flex items-center gap-2 rounded-full border border-line-strong bg-surface px-4 py-2 text-xs font-medium text-ink shadow-float"
          @click="trayOpen = true"
        >
          <span class="tabular">{{ untimed.length }}</span>
          {{ untimed.length === 1 ? 'habit needs an hour' : 'habits need an hour' }}
        </button>
      </div>

      <!--
        Where a lifted card goes back to. The drawer has slid away by then, so the strip above
        the tab bar becomes the target instead.

        It turns red once the finger is actually over it. A drop zone that looks the same
        whether or not it is armed makes the difference between moving a card and unscheduling
        it something you find out afterwards.
      -->
      <div
        v-if="drag.isDragging.value"
        :data-drop-zone="TRAY_ZONE"
        class="safe-bottom fixed inset-x-0 bottom-0 z-50 mx-auto flex max-w-md items-center justify-center px-4 pb-4 text-xs font-medium transition-colors"
      >
        <span
          class="rounded-full border px-4 py-2 transition-colors"
          :class="
            drag.activeZone.value === TRAY_ZONE
              ? 'border-relapse bg-relapse-soft text-relapse'
              : 'border-dashed border-line-strong bg-surface text-ink-subtle'
          "
        >
          {{
            drag.activeZone.value === TRAY_ZONE
              ? 'Release to take its hour away'
              : 'Drop here to loosen it'
          }}
        </span>
      </div>

      <!--
        One line, not five. The instructions were spending a fifth of a phone screen
        explaining gestures to someone who has already used them once, above the surface the
        gestures are for.
      -->
      <div class="mt-3 mb-2 flex items-center justify-between gap-3">
        <p class="min-w-0 flex-1 truncate text-xs text-ink-subtle">
          Hold to move · drag a corner · tap an empty hour
        </p>

        <!--
          Stretching the day is how a step gets smaller, so the readout names the step rather
          than the zoom: what changes here is what you can actually save.
        -->
        <div
          class="flex shrink-0 items-center gap-1 rounded-full border border-line p-1"
          role="group"
          :aria-label="ZOOM_LABEL"
        >
          <button
            type="button"
            class="grid size-7 place-items-center rounded-full text-ink-muted disabled:opacity-30"
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
            class="grid size-7 place-items-center rounded-full text-ink-muted disabled:opacity-30"
            aria-label="Closer view, finer steps"
            :disabled="preferences.preferences.timeline === 'fine'"
            @click="preferences.zoomTimeline(1)"
          >
            <AppIcon name="plus" :size="14" />
          </button>
        </div>
      </div>

      <!--
        The ruler ends above the system's own navigation bar, not underneath it.

        The page's own padding is not enough here: the day is 1440 pixels of scrollable
        content whose last hour lands exactly where the phone draws its back button, and the
        drawer's pill floats over the same strip. Both have to be cleared or 23:00 is a row
        you can see and never reach.
      -->
      <div class="pb-28">
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
              <span class="absolute -top-1.5 right-2">{{
                preferences.formatClock(hour * 60)
              }}</span>
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
              @click="editing = entry.key"
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
            class="grippable relative mr-2 flex-1 rounded-md border transition-colors"
            :class="
              drag.isDragging.value && drag.activeZone.value === TIMELINE_ZONE
                ? 'border-line-strong'
                : 'border-line'
            "
            :style="{ height: `${MINUTES_IN_DAY * pixelsPerMinute}px` }"
            @click="openSlot"
            @pointerdown="startPageSwipe"
            @pointermove="pageSwipe.move($event)"
            @pointerup="pageSwipe.release($event)"
            @pointercancel="pageSwipe.cancel()"
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
              class="pointer-events-none absolute inset-x-1 rounded-md border border-dashed border-line-strong"
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
              class="absolute inset-x-1 z-20 flex items-center justify-center rounded-md border-2 border-dashed border-line-strong bg-accent/40"
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
              @press="liftCard(entry, $event)"
              @move="trackHover($event)"
              @release="drag.release($event)"
              @cancel="abandonLift"
            >
              <div
                class="relative h-full overflow-hidden rounded-md border border-line bg-surface px-2.5 py-1.5 shadow-card active:scale-[0.98]"
                :style="surfaceStyle(entry.habit)"
                role="button"
                :aria-label="`Adjust ${entry.habit.name}`"
                @click="openOccurrence(entry.key, $event)"
              >
                <!--
                Two contact points, stacked on the edge a right hand reaches first, with the
                whole middle of the card left to move it. One grip could only ever change the
                length; moving the start without moving the finish needs its own edge.

                Both on the right rather than diagonally opposite: the top left corner is
                where the habit's name starts, and a dot sitting on the first letter of
                "Drink" makes the label unreadable to save a few pixels of travel.

                Each is deliberately larger than it is drawn: a nine pixel dot is unhittable
                with a thumb, so the touchable square reaches into the card while only the
                dot is painted.
              -->
                <span
                  v-for="edge in ['start', 'end'] as const"
                  :key="edge"
                  data-resize-grip
                  :data-edge="edge"
                  class="grippable absolute right-0 z-10 flex size-7 cursor-ns-resize touch-none items-center justify-center"
                  :class="edge === 'start' ? '-top-1' : '-bottom-1'"
                  aria-hidden="true"
                  @pointerdown="startResize(entry, edge, $event)"
                  @pointermove="moveResize($event)"
                  @pointerup="endResize($event)"
                  @pointercancel="resizing = null"
                  @click.stop
                >
                  <span class="size-2.5 rounded-full border-2 border-current bg-surface" />
                </span>
                <p class="flex items-center gap-1 truncate pr-6 text-xs font-medium">
                  <AppIcon v-if="entry.reminder !== undefined" name="bell" :size="11" />
                  {{ entry.habit.name }}
                </p>
                <p class="tabular truncate text-[0.625rem] opacity-75">
                  {{ previewLabel(entry.key) ?? entry.label }}
                </p>
              </div>
            </DraggableItem>
          </div>
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

      <!-- Grouped the same way the tray is: this is the same choice, made from a slot. -->
      <ul v-if="untimed.length" class="space-y-1.5">
        <li v-for="row in trayRows" :key="row.key">
          <p
            v-if="row.kind === 'heading'"
            class="pt-2 text-[0.625rem] font-semibold tracking-wide text-ink-muted uppercase"
          >
            {{ row.title }}
          </p>
          <button
            v-else
            type="button"
            class="w-full rounded-cell border border-line-strong bg-surface px-3.5 py-3 text-left text-sm font-medium text-ink"
            :style="surfaceStyle(row.entry.habit)"
            @click="fillSlot(row.entry.duty)"
          >
            {{ row.entry.habit.name }}
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
        {{ editingEntry?.habit.name ?? 'Occurrence' }}
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

      <!--
        The way off the day, from the sheet that opens on the card itself. Everything else
        here changes when a thing happens; this is the one that says it will not.
      -->
      <div class="mt-5 flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-relapse"
          @click="loosenEditing"
        >
          Take its hour away
        </button>
        <button
          type="button"
          class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-muted"
          @click="editing = null"
        >
          Done
        </button>
      </div>
    </AppDialog>

    <DragGhost
      v-if="drag.isDragging.value"
      :position="drag.position.value"
      :label="drag.payload.value?.habit.name ?? ''"
      :box="ghostBox ?? undefined"
      :grabbed-offset="grabbedOffset"
      :detail="hoverTime === null ? undefined : preferences.formatClock(hoverTime)"
    />
  </div>
</template>
