<script setup lang="ts">
import { computed, ref } from 'vue'

import type { PatternName, SymbolName } from '@shared/domain/appearance'
import { todayIn, type Weekday } from '@shared/domain/calendar-date'
import type { HexColour } from '@shared/domain/colour'
import { newIdentifier } from '@shared/domain/identifier'
import { endOf, formatTime, parseTime, spanBetween } from '@shared/domain/time-of-day'
import AppearancePicker from '@shared/ui/AppearancePicker.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { type BlockTime, createBlockTime } from '@modules/block-time/domain/block-time'

const props = defineProps<{ initial?: BlockTime; submitLabel: string; busy: boolean }>()
const emit = defineEmits<{ submit: [block: BlockTime] }>()

const WEEKDAYS: ReadonlyArray<{ value: Weekday; label: string }> = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 7, label: 'S' },
]

const name = ref(props.initial?.name ?? '')
const start = ref(props.initial ? formatTime(props.initial.span.start) : '09:00')
const end = ref(props.initial ? formatTime(endOf(props.initial.span)) : '17:00')
const days = ref<Weekday[]>([...(props.initial?.weekdays ?? [1, 2, 3, 4, 5])])
const colour = ref<HexColour | undefined>(props.initial?.colour)
const pattern = ref<PatternName | undefined>(props.initial?.pattern)
const symbol = ref<SymbolName | undefined>(props.initial?.symbol)
const error = ref<string | null>(null)

/** Shown live, because "23:00 to 07:00 is eight hours" is worth confirming before saving. */
const durationLabel = computed(() => {
  try {
    const span = spanBetween(parseTime(start.value), parseTime(end.value))
    const hours = Math.floor(span.durationMinutes / 60)
    const minutes = span.durationMinutes % 60

    return `${hours}h${minutes ? ` ${minutes}m` : ''}`
  } catch {
    return '—'
  }
})

function toggleDay(day: Weekday) {
  days.value = days.value.includes(day)
    ? days.value.filter((candidate) => candidate !== day)
    : [...days.value, day]
}

function submit() {
  error.value = null

  try {
    // Identity survives an edit, which is also what lets the overlap check skip the block's
    // own stored copy instead of reporting it as colliding with itself.
    emit(
      'submit',
      createBlockTime({
        id: props.initial?.id ?? newIdentifier(),
        name: name.value,
        span: spanBetween(parseTime(start.value), parseTime(end.value)),
        weekdays: days.value,
        createdOn: props.initial?.createdOn ?? todayIn(),
        archivedOn: props.initial?.archivedOn,
        colour: colour.value,
        pattern: pattern.value,
        symbol: symbol.value,
      }),
    )
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'That block is not valid.'
  }
}

/** Lets a parent surface a rejection that only the stored blocks could reveal. */
function reject(message: string) {
  error.value = message
}

defineExpose({ reject })
</script>

<template>
  <form class="space-y-5" @submit.prevent="submit">
    <div>
      <label for="block-name" class="mb-1.5 block text-xs font-medium text-ink-muted">Name</label>
      <input
        id="block-name"
        v-model="name"
        type="text"
        required
        placeholder="Sleep"
        class="w-full rounded-cell border border-line-strong bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle"
      />
    </div>

    <div class="flex items-end gap-2">
      <label class="flex-1 text-xs font-medium text-ink-muted">
        From
        <input
          v-model="start"
          type="time"
          required
          aria-label="Starts at"
          class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
        />
      </label>
      <label class="flex-1 text-xs font-medium text-ink-muted">
        To
        <input
          v-model="end"
          type="time"
          required
          aria-label="Ends at"
          class="tabular mt-1.5 w-full rounded-cell border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink"
        />
      </label>
      <span class="tabular pb-3 text-xs text-ink-subtle">{{ durationLabel }}</span>
    </div>

    <p class="-mt-3 text-xs text-ink-subtle">
      An end earlier than the start means the next morning, so sleep runs 23:00 to 07:00.
    </p>

    <fieldset>
      <legend class="mb-1.5 text-xs font-medium text-ink-muted">Which days</legend>
      <div class="flex gap-1.5">
        <button
          v-for="(day, index) in WEEKDAYS"
          :key="index"
          type="button"
          class="size-10 rounded-full border text-xs font-medium transition-colors"
          :class="
            days.includes(day.value)
              ? 'border-ink bg-ink text-ink-inverse'
              : 'border-line bg-surface text-ink-muted'
          "
          :aria-pressed="days.includes(day.value)"
          :aria-label="`Day ${day.value}`"
          @click="toggleDay(day.value)"
        >
          {{ day.label }}
        </button>
      </div>
    </fieldset>

    <fieldset>
      <legend class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase">
        Appearance
      </legend>
      <AppearancePicker v-model:colour="colour" v-model:pattern="pattern" v-model:symbol="symbol" />
    </fieldset>

    <p v-if="error" role="alert" class="rounded-cell bg-relapse-soft p-3 text-xs text-relapse">
      {{ error }}
    </p>

    <div class="flex gap-2 pt-1">
      <RouterLink
        to="/block-time"
        class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-center text-sm font-medium text-ink-muted"
      >
        Cancel
      </RouterLink>
      <button
        type="submit"
        class="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-50"
        :disabled="busy"
      >
        <AppSpinner v-if="busy" :size="14" label="Saving" />
        {{ submitLabel }}
      </button>
    </div>

    <p class="text-xs text-ink-subtle">
      Blocks may not overlap each other: you cannot be asleep and at work at once. Habits may
      overlap them freely, since reading during a commute is a real plan.
    </p>
  </form>
</template>
