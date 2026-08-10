<script setup lang="ts">
import { computed, ref } from 'vue'

import { buildPreviewDataset } from '@shared/dev/preview-dataset'
import { useHabits } from '@modules/habits/application/habit-queries'
import { useReplaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

const { data: habitsData } = useHabits()
const replaceDataset = useReplaceDataset()

const habitCount = computed(() => habitsData.value?.length ?? 0)
/** Clearing is irreversible and there is no sync to restore from, so it asks twice. */
const confirmingClear = ref(false)

async function loadDemoData() {
  await replaceDataset.mutateAsync(buildPreviewDataset())
}

async function clearEverything() {
  if (!confirmingClear.value) {
    confirmingClear.value = true

    return
  }

  await replaceDataset.mutateAsync(EMPTY_DATASET)
  confirmingClear.value = false
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
          Replaces everything with a worked example: two positive habits, one measured, one to quit,
          plus sleep and work as block time.
        </p>
        <button
          type="button"
          class="mt-3 rounded-full bg-ink px-4 py-2 text-xs font-medium text-ink-inverse transition-transform active:scale-95 disabled:opacity-50"
          :disabled="replaceDataset.isLoading.value"
          @click="loadDemoData"
        >
          {{ replaceDataset.isLoading.value ? 'Working…' : 'Load demo data' }}
        </button>
      </div>

      <div class="rounded-card border border-line bg-surface p-4 shadow-card">
        <p class="text-sm font-medium text-ink">Clear everything</p>
        <p class="mt-1 text-xs text-ink-muted">
          Deletes every habit, entry and block from this device. Nothing is stored anywhere else, so
          this cannot be undone.
        </p>
        <button
          type="button"
          class="mt-3 rounded-full px-4 py-2 text-xs font-medium transition-transform active:scale-95"
          :class="
            confirmingClear
              ? 'bg-relapse text-ink-inverse'
              : 'border border-line text-ink-muted hover:text-ink'
          "
          @click="clearEverything"
        >
          {{ confirmingClear ? 'Tap again to confirm' : 'Clear everything' }}
        </button>
      </div>
    </section>
  </div>
</template>
