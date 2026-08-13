<script setup lang="ts">
import { computed } from 'vue'

import { addDays, type CalendarDate, toDate, weekday } from '@shared/domain/calendar-date'

import { useSwipePage } from './press/use-swipe-page'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  days: readonly CalendarDate[]
  selected: CalendarDate
  /** Days carrying at least one planned occurrence, shown as a dot under the number. */
  marked?: readonly CalendarDate[]
}>()

const emit = defineEmits<{
  select: [day: CalendarDate]
  previous: []
  next: []
  centre: [day: CalendarDate]
}>()

/** Shorter than a row swipe: a detent has to be reachable without crossing the screen. */
const STEP_PX = 44

/**
 * Dragging the strip sideways steps one day, not one week.
 *
 * A week per swipe is a jump: the day you were looking at leaves the screen and seven
 * strangers arrive. One day per swipe is a detent — the strip advances by one and the
 * selection moves with it, so the gesture reads as a wheel with stops rather than a page
 * turn. Repeating it is how you get to next week, and it stays legible the whole way.
 *
 * The arrows stay, and they still move a whole week. A gesture nobody can see is a gesture
 * most people never find, and the two are useful at different distances.
 */
const swipe = useSwipePage({
  commitPx: STEP_PX,
  onSwipe: (direction) => {
    emit('select', addDays(props.selected, direction === 'right' ? -1 : 1))
  },
})

/**
 * A second tap on a day brings the week around it.
 *
 * The first tap selects, which is what a single tap has always meant. The second says "and
 * put this in the middle", which is the only thing left to ask of a day already selected.
 */
let lastTapped: { day: CalendarDate; at: number } | null = null

const DOUBLE_TAP_MS = 320

function tap(day: CalendarDate, now: number) {
  const previous = lastTapped

  lastTapped = { day, at: now }

  if (previous?.day === day && now - previous.at < DOUBLE_TAP_MS) {
    lastTapped = null
    emit('centre', day)

    return
  }

  emit('select', day)
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const cells = computed(() =>
  props.days.map((day) => ({
    day,
    label: WEEKDAY_LABELS[weekday(day) - 1] ?? '',
    number: toDate(day).getDate(),
    isSelected: day === props.selected,
    isMarked: props.marked?.includes(day) ?? false,
  })),
)
</script>

<template>
  <div
    class="grippable flex touch-pan-y items-center gap-3"
    @pointerdown="swipe.press($event)"
    @pointermove="swipe.move($event)"
    @pointerup="swipe.release($event)"
    @pointercancel="swipe.cancel()"
  >
    <button
      type="button"
      class="hit-area grid size-8 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:text-ink"
      aria-label="Previous week"
      @click="$emit('previous')"
    >
      <AppIcon name="chevron-left" :size="18" />
    </button>

    <ul class="flex flex-1 justify-between gap-1">
      <li v-for="cell in cells" :key="cell.day" class="flex-1">
        <button
          type="button"
          class="flex w-full flex-col items-center gap-1 rounded-cell px-1 py-2 transition-colors"
          :class="
            cell.isSelected ? 'bg-ink text-ink-inverse' : 'text-ink-muted hover:bg-surface-sunken'
          "
          :aria-pressed="cell.isSelected"
          @click="tap(cell.day, $event.timeStamp)"
        >
          <span class="text-[0.6875rem] font-medium">{{ cell.label }}</span>
          <span class="tabular text-base font-semibold">{{ cell.number }}</span>
          <span
            class="size-1 rounded-full transition-colors"
            :class="
              cell.isMarked
                ? cell.isSelected
                  ? 'bg-ink-inverse'
                  : 'bg-ink-subtle'
                : 'bg-transparent'
            "
            :aria-hidden="true"
          />
          <span v-if="cell.isMarked" class="sr-only">has something planned</span>
        </button>
      </li>
    </ul>

    <button
      type="button"
      class="hit-area grid size-8 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:text-ink"
      aria-label="Next week"
      @click="$emit('next')"
    >
      <AppIcon name="chevron-right" :size="18" />
    </button>
  </div>
</template>
