<script setup lang="ts">
import { computed } from 'vue'

import { buildPreviewDataset } from '@shared/dev/preview-dataset'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { useHabits } from '@modules/habits/application/habit-queries'
import { useReplaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

const { data: habitsData } = useHabits()
const replaceDataset = useReplaceDataset()
const feedback = useFeedback()

const habitCount = computed(() => habitsData.value?.length ?? 0)
const isWorking = computed(() => replaceDataset.isLoading.value)

async function loadDemoData() {
  const accepted = await feedback.confirm({
    title: 'Load demo data?',
    message: 'This replaces everything currently stored on this device with a worked example.',
    confirmLabel: 'Replace',
  })

  if (!accepted) return

  await replaceDataset.mutateAsync(buildPreviewDataset())
  feedback.notify('Demo data loaded', 'success')
}

async function clearEverything() {
  const accepted = await feedback.confirm({
    title: 'Clear everything?',
    message:
      'Every habit, entry and block is deleted from this device. Nothing is stored anywhere else, so this cannot be undone.',
    confirmLabel: 'Delete everything',
    tone: 'danger',
  })

  if (!accepted) return

  await replaceDataset.mutateAsync(EMPTY_DATASET)
  feedback.notify('Everything cleared', 'danger')
}
</script>

<template>
  <div class="safe-top">
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Settings</h1>
      <p class="text-sm text-ink-muted">
        {{ habitCount }} {{ habitCount === 1 ? 'habit' : 'habits' }} stored on this device
      </p>
    </header>

    <section class="mb-5 space-y-2" aria-labelledby="day-heading">
      <h2
        id="day-heading"
        class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
      >
        Your day
      </h2>

      <RouterLink
        to="/block-time"
        class="flex items-center gap-3 rounded-card border border-line bg-surface p-4 shadow-card"
      >
        <div class="min-w-0 flex-1">
          <p class="text-sm font-medium text-ink">Block time</p>
          <p class="mt-1 text-xs text-ink-muted">
            Sleep, work and anything else that is not up for negotiation. Blocks cannot overlap each
            other, so the room left in a day stays honest.
          </p>
        </div>
        <AppIcon name="chevron-right" :size="18" />
      </RouterLink>
    </section>

    <section class="space-y-2" aria-labelledby="data-heading">
      <h2
        id="data-heading"
        class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
      >
        Data
      </h2>

      <div class="rounded-card border border-line bg-surface p-4 shadow-card">
        <p class="text-sm font-medium text-ink">Load demo data</p>
        <p class="mt-1 text-xs text-ink-muted">
          A worked example: two positive habits, one measured, one to quit, plus sleep and work as
          block time.
        </p>
        <button
          type="button"
          class="mt-3 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-ink-inverse transition-transform active:scale-95 disabled:opacity-50"
          :disabled="isWorking"
          @click="loadDemoData"
        >
          <AppSpinner v-if="isWorking" :size="12" label="Saving" />
          Load demo data
        </button>
      </div>

      <div class="rounded-card border border-line bg-surface p-4 shadow-card">
        <p class="text-sm font-medium text-ink">Clear everything</p>
        <p class="mt-1 text-xs text-ink-muted">
          Deletes every habit, entry and block from this device. This cannot be undone.
        </p>
        <button
          type="button"
          class="mt-3 inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
          :disabled="isWorking"
          @click="clearEverything"
        >
          <AppSpinner v-if="isWorking" :size="12" label="Working" />
          Clear everything
        </button>
      </div>
    </section>
  </div>
</template>
