<script setup lang="ts">
import { computed } from 'vue'

import { addDays, type CalendarDate, toDate, weekday } from '@shared/domain/calendar-date'

import { tick } from '@core/haptics'

import { useDetentDrag } from './press/use-detent-drag'
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

/**
 * One day's worth of travel.
 *
 * Roughly a cell on a phone. It is a constant rather than a measurement because the strip is
 * seven equal columns of whatever width the screen has, and a value that changed with the
 * device would make the gesture feel different on each one.
 */
const STEP_PX = 46

/**
 * The strip follows the finger and settles on a day.
 *
 * It used to commit a whole day per swipe: a detent with no travel, where nothing moved until
 * the gesture was over and the day then jumped. Now the row slides under the finger, ticks as
 * it crosses each day, and lands on the nearest one when released — so half a day is never
 * left sitting at an edge, and you can see you are between two before choosing.
 *
 * The arrows stay, and they still move a whole week. A gesture nobody can see is one most
 * people never find, and the two are useful at different distances.
 */
const drag = useDetentDrag({
  stepPx: STEP_PX,
  onDetent: tick,
  onSettle: (steps) => emit('select', addDays(props.selected, steps)),
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
    class="grippable flex touch-pan-y items-center gap-3 overflow-hidden"
    @pointerdown="drag.press($event)"
    @pointermove="drag.move($event)"
    @pointerup="drag.release($event)"
    @pointercancel="drag.cancel()"
  >
    <button
      type="button"
      class="hit-area grid size-8 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:text-ink"
      aria-label="Previous week"
      @click="$emit('previous')"
    >
      <AppIcon name="chevron-left" :size="18" />
    </button>

    <!--
      Translated live, and only while a finger is on it. The transition is off during the
      drag so the row tracks the finger exactly, and on afterwards so it settles rather than
      snapping back.
    -->
    <ul
      class="flex flex-1 justify-between gap-1"
      :class="drag.isDragging.value ? '' : 'transition-transform duration-200'"
      :style="{ transform: `translateX(${drag.offset.value}px)` }"
    >
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
