<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'

import { type CalendarDate, toDate, weekday } from '@shared/domain/calendar-date'
import { tick } from '@core/haptics'

import AppIcon from './AppIcon.vue'

const props = defineProps<{
  /** Every day the ribbon can reach, in order. Far more than fit on screen. */
  days: readonly CalendarDate[]
  selected: CalendarDate
  /** Days carrying at least one planned occurrence, shown as a dot under the number. */
  marked?: readonly CalendarDate[]
}>()

const emit = defineEmits<{ select: [day: CalendarDate] }>()

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

const ribbon = useTemplateRef<HTMLElement>('ribbon')

/** Brings a day to the middle, which is where a chosen day belongs. */
function centre(day: CalendarDate, behavior: ScrollBehavior = 'smooth') {
  const element = ribbon.value?.querySelector<HTMLElement>(`[data-day="${day}"]`)

  if (!element || !ribbon.value) return

  const container = ribbon.value
  const target = element.offsetLeft - (container.clientWidth - element.clientWidth) / 2

  // `scrollTo` rather than `scrollIntoView`: the latter also scrolls every ancestor, which
  // on this screen jumps the whole page to put a date in view.
  container.scrollTo({ left: target, behavior })
}

onMounted(() => {
  void nextTick(() => centre(props.selected, 'auto'))
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

function onScroll() {
  const container = ribbon.value

  if (!container) return

  const middle = container.scrollLeft + container.clientWidth / 2
  const index = Math.round(middle / (container.scrollWidth / Math.max(cells.value.length, 1)) - 0.5)
  const day = cells.value[Math.min(Math.max(index, 0), cells.value.length - 1)]?.day ?? null

  if (day === centred.value) return

  // Once per day crossed, not once per scroll event, or a flick becomes a buzz.
  if (centred.value !== null) tick()

  centred.value = day
}

function step(days: number) {
  const container = ribbon.value

  if (!container) return

  const cellWidth = container.scrollWidth / Math.max(cells.value.length, 1)

  container.scrollBy({ left: cellWidth * days, behavior: 'smooth' })
}
</script>

<template>
  <div class="flex items-center gap-1">
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
      class="grippable flex min-w-0 flex-1 snap-x snap-mandatory gap-1 overflow-x-auto overscroll-x-contain scroll-smooth"
      @scroll="onScroll"
    >
      <li
        v-for="cell in cells"
        :key="cell.day"
        :data-day="cell.day"
        class="w-11 shrink-0 snap-center"
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
