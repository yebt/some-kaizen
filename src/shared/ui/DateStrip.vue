<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'

import { type CalendarDate, toDate, weekday } from '@shared/domain/calendar-date'
import { tick } from '@core/haptics'

import AppIcon from './AppIcon.vue'
import { isShowing, scrollToCentre } from './ribbon-geometry'

const props = defineProps<{
  /** Every day the ribbon can reach, in order. Far more than fit on screen. */
  days: readonly CalendarDate[]
  selected: CalendarDate
  /** Days carrying at least one planned occurrence, shown as a dot under the number. */
  marked?: readonly CalendarDate[]
}>()

const emit = defineEmits<{
  select: [day: CalendarDate]
  /** Whether the chosen day is currently on screen, so a caller can offer the way back. */
  'in-view': [visible: boolean]
}>()

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/**
 * A ribbon the browser scrolls, rather than a week a gesture replaces.
 *
 * Two hand written versions came before this one and both were wrong in the same way: they
 * moved a fixed set of seven days and had nothing to show at the edges, so mid-gesture the
 * strip slid away from empty space instead of towards the days either side of it.
 *
 * The platform already does this properly. Overflow scrolling gives free travel, momentum
 * and rubber banding; `scroll-snap` settles on a whole day so half a one is never left at an
 * edge. What is left to write is the part the platform cannot know: that scrolling is not
 * choosing, and that crossing a day is worth a tick you can feel.
 */
const cells = computed(() =>
  props.days.map((day) => ({
    day,
    label: WEEKDAY_LABELS[weekday(day) - 1] ?? '',
    number: toDate(day).getDate(),
    isSelected: day === props.selected,
    isMarked: props.marked?.includes(day) ?? false,
  })),
)

/**
 * Where the ribbon was left, remembered across mounts.
 *
 * Module level on purpose: it belongs to the strip as a control rather than to any one visit
 * to the screen, and it must survive the component being destroyed and rebuilt — which is
 * exactly what happens on every navigation away and back.
 *
 * Without it, arriving home rendered the ribbon at its start and then scrolled it to today a
 * tick later, so every visit began with a visible jolt. Restoring a remembered position has
 * nothing to animate, because it is already where it was.
 */
let rememberedPosition: number | null = null

const ribbon = useTemplateRef<HTMLElement>('ribbon')

/** The container and a cell, in one coordinate space, for the geometry helpers to compare. */
function measure(day: CalendarDate) {
  const container = ribbon.value
  const element = container?.querySelector<HTMLElement>(`[data-day="${day}"]`)

  if (!container || !element) return null

  const box = container.getBoundingClientRect()
  const cellBox = element.getBoundingClientRect()

  return {
    container: { left: box.left, width: box.width, scrollLeft: container.scrollLeft },
    cell: { left: cellBox.left, width: cellBox.width },
    element: container,
  }
}

/** Brings a day to the middle, which is where a chosen day belongs. */
function centre(day: CalendarDate, behavior: ScrollBehavior = 'smooth') {
  const measured = measure(day)

  if (!measured) return

  // `scrollTo` rather than `scrollIntoView`: the latter also scrolls every ancestor, which
  // on this screen jumps the whole page to put a date in view.
  measured.element.scrollTo({
    left: scrollToCentre(measured.container, measured.cell),
    behavior,
  })
}

/**
 * Puts the ribbon where it belongs before the browser has drawn it anywhere else.
 *
 * Synchronous, and deliberately not inside `nextTick`. The cells are part of the first render,
 * so by the time this runs they are already in the document and the position can simply be
 * assigned — a tick later is a tick after the browser has painted a ribbon sitting at its very
 * start, which is the jolt you see on arriving.
 *
 * The smooth scrolling that used to live in CSS is gone for the same reason: it applied to
 * every change of position, so restoring a remembered place animated its way there from the
 * beginning of the year. Animation is now asked for per call, by the controls that want it.
 */
onMounted(() => {
  const container = ribbon.value

  if (!container) return

  // Put it back where it was, then check the chosen day is actually there. Restoring blind
  // would open the screen four months away from the day being worked on, which is a worse
  // greeting than the jolt this exists to remove.
  if (rememberedPosition !== null) container.scrollLeft = rememberedPosition

  const measured = measure(props.selected)

  if (!measured || !isShowing(measured.container, measured.cell)) centre(props.selected, 'auto')

  // Said once at the start too: a ribbon that opens already centred fires no scroll event,
  // and a caller waiting to hear would wait for ever.
  reportVisibility()
})

/**
 * Follows a selection made anywhere else, and only that.
 *
 * Watching the value rather than the scroll is what keeps the two apart: turning the ribbon
 * changes nothing, so nothing here reacts to it.
 */
watch(
  () => props.selected,
  (day) => {
    void nextTick(() => centre(day))
  },
)

/** The day nearest the middle right now, which is what a tick is counting. */
const centred = ref<CalendarDate | null>(null)

/**
 * Whether the chosen day is still somewhere on screen.
 *
 * The ribbon scrolls without changing anything, which is the point — and the cost is that you
 * can leave the day you are working on far behind with nothing saying so. Reported rather
 * than solved here: the strip knows where things are, and the screen around it owns what to
 * offer about it.
 */
function reportVisibility() {
  const measured = measure(props.selected)

  if (!measured) return

  emit('in-view', isShowing(measured.container, measured.cell))
}

function onScroll() {
  const container = ribbon.value

  if (!container) return

  rememberedPosition = container.scrollLeft
  reportVisibility()

  const middle = container.scrollLeft + container.clientWidth / 2
  const index = Math.round(middle / (container.scrollWidth / Math.max(cells.value.length, 1)) - 0.5)
  const day = cells.value[Math.min(Math.max(index, 0), cells.value.length - 1)]?.day ?? null

  if (day === centred.value) return

  // Once per day crossed, not once per scroll event, or a flick becomes a buzz.
  if (centred.value !== null) tick()

  centred.value = day
}

/**
 * Brings the chosen day back into the middle without changing it.
 *
 * Exposed because the ribbon's position is the browser's, not a value this component can be
 * told: a parent that wants the day back on screen has to ask rather than set.
 */
defineExpose({ recentre: () => centre(props.selected) })

function step(days: number) {
  const container = ribbon.value

  if (!container) return

  const cellWidth = container.scrollWidth / Math.max(cells.value.length, 1)

  container.scrollBy({ left: cellWidth * days, behavior: 'smooth' })
}
</script>

<template>
  <div class="flex items-center gap-1 overflow-hidden">
    <button
      type="button"
      class="hit-area grid size-8 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:text-ink"
      aria-label="Previous week"
      @click="step(-7)"
    >
      <AppIcon name="chevron-left" :size="18" />
    </button>

    <!--
      `min-w-0` is the load bearing class, not the overflow.

      A flex item defaults to `min-width: auto`, which means "at least as wide as my content".
      The content here is four months of days, so the ribbon pushed its own row past the
      screen and took the whole page with it — a page that scrolls sideways, with the ribbon
      never scrolling at all. `overflow-x-auto` cannot help while the box is free to grow.

      `overscroll-contain` keeps a flick that runs off the end from turning into the page
      navigating back, which on Android is one rubber band away.
    -->
    <ul
      ref="ribbon"
      class="grippable flex min-w-0 flex-1 snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain"
      @scroll="onScroll"
    >
      <li
        v-for="cell in cells"
        :key="cell.day"
        :data-day="cell.day"
        class="relative w-11 shrink-0 snap-center"
      >
        <button
          type="button"
          class="flex w-full flex-col items-center gap-1 rounded-cell px-1 py-2 transition-colors"
          :class="
            cell.isSelected ? 'bg-ink text-ink-inverse' : 'text-ink-muted hover:bg-surface-sunken'
          "
          :aria-pressed="cell.isSelected"
          @click="emit('select', cell.day)"
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
            aria-hidden="true"
          />
          <!--
            The cell is positioned so this stays inside it.

            `sr-only` is absolutely positioned, so without a positioned ancestor it is placed
            against the page rather than the ribbon — and a ribbon scrolled four months along
            put an invisible one-pixel span nearly six thousand pixels from the left, which
            made the whole document scroll sideways. It appeared the moment a day gained a
            dot, which is why marking a habit done was what triggered it.
          -->
          <span v-if="cell.isMarked" class="sr-only">has something planned</span>
        </button>
      </li>
    </ul>

    <button
      type="button"
      class="hit-area grid size-8 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:text-ink"
      aria-label="Next week"
      @click="step(7)"
    >
      <AppIcon name="chevron-right" :size="18" />
    </button>
  </div>
</template>

<style scoped>
/* The bar itself is noise on a control this small; the days are their own affordance. */
ul::-webkit-scrollbar {
  display: none;
}

ul {
  scrollbar-width: none;
}
</style>
