<script setup lang="ts">
import { computed } from 'vue'

import { type CalendarDate, toDate, weekday } from '@shared/domain/calendar-date'

import AppIcon from './AppIcon.vue'

const props = defineProps<{
  days: readonly CalendarDate[]
  selected: CalendarDate
  /** Days carrying at least one planned occurrence, shown as a dot under the number. */
  marked?: readonly CalendarDate[]
}>()

defineEmits<{ select: [day: CalendarDate]; previous: []; next: [] }>()

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
  <div class="flex items-center gap-3">
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
          @click="$emit('select', cell.day)"
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
          />
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
