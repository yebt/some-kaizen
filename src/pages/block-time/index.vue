<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import type { Weekday } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import { endOf } from '@shared/domain/time-of-day'
import ActionSheet, { type SheetAction } from '@shared/ui/ActionSheet.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { surfaceStyle } from '@shared/ui/appearance-style'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { usePressHold } from '@shared/ui/press/use-press-hold'
import { usePreferences } from '@core/preferences-store'
import type { BlockTime } from '@modules/block-time/domain/block-time'
import {
  useBlockTime,
  useRemoveBlockTime,
} from '@modules/block-time/application/block-time-queries'

const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

const router = useRouter()
const { data: blocksData, isLoading } = useBlockTime()
const removeBlock = useRemoveBlockTime()
const feedback = useFeedback()
const preferences = usePreferences()

const blocks = computed(() => blocksData.value ?? [])

/** Weekly totals, so the day's remaining room is a number rather than a feeling. */
const weeklyHours = computed(() => {
  const minutes = blocks.value.reduce(
    (total, block) => total + block.span.durationMinutes * block.weekdays.length,
    0,
  )

  return Math.round(minutes / 60)
})

function describeDays(block: BlockTime): string {
  if (block.weekdays.length === 7) return 'Every day'

  return block.weekdays.map((day) => WEEKDAY_LABELS[day]).join(' ')
}

function describeSpan(block: BlockTime): string {
  return `${preferences.formatClock(block.span.start)} – ${preferences.formatClock(endOf(block.span))}`
}

const menuFor = ref<BlockTime | null>(null)

/** Nothing on this list is draggable, so a hold has no drag gesture to compete with. */
const hold = usePressHold({
  onHold: (id) => {
    menuFor.value = blocks.value.find((block) => block.id === id) ?? null
  },
})

const MENU_ACTIONS: readonly SheetAction[] = [
  { key: 'edit', label: 'Edit', description: 'Hours, days, colour' },
  {
    key: 'remove',
    label: 'Remove',
    description: 'Free the time on every day it covered',
    tone: 'danger',
  },
]

async function runAction(key: string) {
  const block = menuFor.value

  menuFor.value = null

  if (!block) return

  if (key === 'edit') {
    await router.push(`/block-time/${block.id}`)

    return
  }

  if (key === 'remove') await onDelete(block)
}

async function onDelete(block: BlockTime) {
  const accepted = await feedback.confirm({
    title: `Remove ${block.name}?`,
    message: 'The time frees up on every day it covered. Your habits are not affected.',
    confirmLabel: 'Remove',
    tone: 'danger',
  })

  if (!accepted) return

  await removeBlock.mutateAsync(block.id)
  feedback.notify(`${block.name} removed`)
}

function isPressed(id: Identifier) {
  return hold.pendingKey.value === id
}
</script>

<template>
  <div class="safe-top">
    <header class="flex items-center justify-between pt-2 pb-1">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Block time</h1>
      <RouterLink
        to="/block-time/new"
        class="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-inverse"
      >
        <AppIcon name="plus" :size="14" />
        New
      </RouterLink>
    </header>
    <p class="pb-4 text-sm text-ink-muted">
      <template v-if="blocks.length">{{ weeklyHours }} hours a week already spoken for</template>
      <template v-else>Sleep, work, and anything else that is not up for negotiation</template>
    </p>

    <div
      v-if="isLoading && blocksData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading block time" />
    </div>

    <p
      v-else-if="!blocks.length"
      class="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      No blocks yet. Adding sleep and work first makes the rest of the day honest about how much
      room is actually left.
    </p>

    <ul v-else class="space-y-2">
      <li
        v-for="block in blocks"
        :key="block.id"
        class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card transition-transform duration-150"
        :class="isPressed(block.id) && 'scale-[0.97]'"
        @pointerdown="hold.press(block.id, $event)"
        @pointermove="hold.move($event)"
        @pointerup="hold.release($event)"
        @pointercancel="hold.cancel()"
      >
        <span
          v-if="block.colour"
          class="size-8 shrink-0 rounded-full border border-line"
          :style="surfaceStyle(block)"
          aria-hidden="true"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium text-ink">{{ block.name }}</p>
          <p class="tabular text-xs text-ink-muted">{{ describeSpan(block) }}</p>
          <p class="mt-0.5 text-xs text-ink-subtle">{{ describeDays(block) }}</p>
        </div>
        <button
          type="button"
          class="grid size-8 shrink-0 place-items-center rounded-full border border-line text-ink-muted"
          :aria-label="`Actions for ${block.name}`"
          @click="menuFor = block"
        >
          <AppIcon name="more" :size="16" />
        </button>
      </li>
    </ul>

    <ActionSheet
      :open="menuFor !== null"
      :title="menuFor?.name ?? ''"
      :actions="MENU_ACTIONS"
      @select="runAction"
      @dismiss="menuFor = null"
    />
  </div>
</template>
