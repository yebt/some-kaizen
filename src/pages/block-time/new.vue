<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import { todayIn, type Weekday } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { parseTime, spanBetween } from '@shared/domain/time-of-day'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { createBlockTime } from '@modules/block-time/domain/block-time'
import { useSaveBlockTime } from '@modules/block-time/application/block-time-queries'

const WEEKDAYS: ReadonlyArray<{ value: Weekday; label: string }> = [
  { value: 1, label: 'M' },
  { value: 2, label: 'T' },
  { value: 3, label: 'W' },
  { value: 4, label: 'T' },
  { value: 5, label: 'F' },
  { value: 6, label: 'S' },
  { value: 7, label: 'S' },
]

const router = useRouter()
const saveBlock = useSaveBlockTime()
const feedback = useFeedback()

const name = ref('')
const start = ref('09:00')
const end = ref('17:00')
const days = ref<Weekday[]>([1, 2, 3, 4, 5])
const error = ref<string | null>(null)

/** Shown live, because "23:00 to 07:00" being eight hours is worth confirming before saving. */
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

async function submit() {
  error.value = null

  try {
    const block = createBlockTime({
      id: newIdentifier(),
      name: name.value,
      span: spanBetween(parseTime(start.value), parseTime(end.value)),
      weekdays: days.value,
      createdOn: todayIn(),
    })

    // The mutation checks the stored blocks for a collision, so the rule lives in one place
    // rather than being re-implemented by whichever screen happens to be saving.
    await saveBlock.mutateAsync(block)
    feedback.notify(`${block.name} added`, 'success')
    await router.push('/block-time')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : 'That block is not valid.'
  }
}
</script>

<template>
  <div class="safe-top">
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">New block</h1>
      <p class="text-sm text-ink-muted">Fixed commitments the rest of your day is built around.</p>
    </header>

    <form class="space-y-5" @submit.prevent="submit">
      <div>
        <label for="block-name" class="mb-1.5 block text-xs font-medium text-ink-muted">Name</label>
        <input
          id="block-name"
          v-model="name"
          type="text"
          required
          placeholder="Sleep"
          class="w-full rounded-cell border border-line bg-surface px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-subtle"
        />
      </div>

      <div class="flex items-end gap-2">
        <label class="flex-1 text-xs font-medium text-ink-muted">
          From
          <input
            v-model="start"
            type="time"
            required
            class="tabular mt-1.5 w-full rounded-cell border border-line bg-surface px-3 py-2.5 text-sm text-ink"
          />
        </label>
        <label class="flex-1 text-xs font-medium text-ink-muted">
          To
          <input
            v-model="end"
            type="time"
            required
            class="tabular mt-1.5 w-full rounded-cell border border-line bg-surface px-3 py-2.5 text-sm text-ink"
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

      <p v-if="error" role="alert" class="rounded-cell bg-relapse-soft p-3 text-xs text-relapse">
        {{ error }}
      </p>

      <div class="flex gap-2 pt-1">
        <RouterLink
          to="/block-time"
          class="flex-1 rounded-full border border-line px-4 py-2.5 text-center text-sm font-medium text-ink-muted"
        >
          Cancel
        </RouterLink>
        <button
          type="submit"
          class="flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-50"
          :disabled="saveBlock.isLoading.value"
        >
          <AppSpinner v-if="saveBlock.isLoading.value" :size="14" label="Saving" />
          Add block
        </button>
      </div>
    </form>

    <p class="mt-4 text-xs text-ink-subtle">
      Blocks may not overlap each other: you cannot be asleep and at work at once. Habits may
      overlap them freely, since reading during a commute is a real plan.
    </p>
  </div>
</template>
