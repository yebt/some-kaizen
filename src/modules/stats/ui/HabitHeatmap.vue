<script setup lang="ts">
import { computed } from 'vue'

import { type CalendarDate, eachDayBetween, toDate, weekday } from '@shared/domain/calendar-date'
import type { DayMark } from '@modules/stats/domain/habit-statistics'

const props = defineProps<{
  marks: Map<CalendarDate, DayMark>
  from: CalendarDate
  to: CalendarDate
}>()

/**
 * One class per outcome, with `none` deliberately the quietest.
 *
 * A day never answered must not look like a failure, or a calendar of an app you forgot to
 * open for a fortnight reads as a fortnight of defeat rather than as a fortnight of
 * silence.
 */
const MARK_CLASS: Record<DayMark, string> = {
  none: 'bg-surface-sunken',
  done: 'bg-done',
  partial: 'bg-partial',
  missed: 'bg-missed-soft ring-1 ring-inset ring-missed/40',
  avoided: 'bg-done',
  relapsed: 'bg-relapse',
}

const MARK_LABEL: Record<DayMark, string> = {
  none: 'not answered',
  done: 'done',
  partial: 'partial',
  missed: 'missed',
  avoided: 'clean',
  relapsed: 'relapse',
}

/**
 * Laid out as columns of weeks, each column running Monday to Sunday.
 *
 * Leading blanks keep every row on the same weekday, so a glance down a row answers "am I
 * always missing Wednesdays?" — which is the question a heatmap is actually good at.
 */
const columns = computed(() => {
  const days = eachDayBetween(props.from, props.to)
  const first = days[0]

  if (!first) return []

  const cells: Array<{ day: CalendarDate; mark: DayMark } | null> = [
    ...Array.from({ length: weekday(first) - 1 }, () => null),
    ...days.map((day) => ({ day, mark: props.marks.get(day) ?? 'none' })),
  ]

  const weeks: Array<Array<{ day: CalendarDate; mark: DayMark } | null>> = []

  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7))
  }

  return weeks
})

const formatter = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' })

function describe(cell: { day: CalendarDate; mark: DayMark }) {
  return `${formatter.format(toDate(cell.day))}: ${MARK_LABEL[cell.mark]}`
}
</script>

<template>
  <div class="overflow-x-auto">
    <div class="flex gap-1" role="img" aria-label="Daily history">
      <div v-for="(week, index) in columns" :key="index" class="flex flex-col gap-1">
        <span
          v-for="(cell, row) in week"
          :key="row"
          class="size-3 rounded-[3px]"
          :class="cell ? MARK_CLASS[cell.mark] : 'bg-transparent'"
          :title="cell ? describe(cell) : undefined"
        />
      </div>
    </div>
  </div>
</template>
