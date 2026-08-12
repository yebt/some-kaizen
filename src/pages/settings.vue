<script setup lang="ts">
import { computed, ref } from 'vue'

import { buildPreviewDataset } from '@shared/dev/preview-dataset'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { usePersistence } from '@core/persistence-context'
import { usePreferences } from '@core/preferences-store'
import { useHabits } from '@modules/habits/application/habit-queries'
import { readDataset, useReplaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'
import { parseBackup, serializeDataset } from '@modules/data/domain/data-transfer'
import { backupFileName } from '@modules/data/domain/file-exchange'
import { createBrowserFileExchange } from '@modules/data/infrastructure/browser-file-exchange'

const { data: habitsData } = useHabits()
const persistence = usePersistence()
const replaceDataset = useReplaceDataset()
const feedback = useFeedback()
const files = createBrowserFileExchange()
const preferences = usePreferences()
const isExporting = ref(false)

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const

const CLOCKS = [
  { value: '24h', label: '24 hour' },
  { value: '12h', label: '12 hour' },
] as const

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

async function exportData() {
  isExporting.value = true

  try {
    const exportedAt = new Date()

    await files.save(
      backupFileName(exportedAt),
      serializeDataset(await readDataset(persistence), exportedAt),
    )
    feedback.notify('Backup saved', 'success')
  } finally {
    isExporting.value = false
  }
}

async function importData() {
  const text = await files.pick()

  if (!text) return

  let incoming

  try {
    // Parsed before anything is asked or written, so a corrupt file is refused whole
    // rather than leaving half an import behind.
    incoming = parseBackup(text)
  } catch (error) {
    feedback.notify(
      error instanceof Error ? error.message : 'That file could not be read.',
      'danger',
    )

    return
  }

  const accepted = await feedback.confirm({
    title: 'Restore this backup?',
    message: `It contains ${incoming.habits.length} habits and ${incoming.entries.length} recorded days, and it replaces everything currently on this device.`,
    confirmLabel: 'Restore',
    tone: 'danger',
  })

  if (!accepted) return

  await replaceDataset.mutateAsync(incoming)
  feedback.notify('Backup restored', 'success')
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

    <section class="mb-5" aria-labelledby="appearance-heading">
      <h2
        id="appearance-heading"
        class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
      >
        Appearance
      </h2>

      <div class="space-y-3 rounded-card border border-line bg-surface p-4 shadow-card">
        <div>
          <p class="mb-1.5 text-sm font-medium text-ink">Theme</p>
          <div class="flex gap-1.5">
            <button
              v-for="option in THEMES"
              :key="option.value"
              type="button"
              class="flex-1 rounded-full border px-3 py-2 text-xs font-medium transition-colors"
              :class="
                preferences.preferences.theme === option.value
                  ? 'border-ink bg-ink text-ink-inverse'
                  : 'border-line text-ink-muted'
              "
              :aria-pressed="preferences.preferences.theme === option.value"
              @click="preferences.setTheme(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <p class="mt-1.5 text-xs text-ink-subtle">
            System follows the phone, so an evening switch to dark takes the app with it.
          </p>
        </div>

        <div>
          <p class="mb-1.5 text-sm font-medium text-ink">Clock</p>
          <div class="flex gap-1.5">
            <button
              v-for="option in CLOCKS"
              :key="option.value"
              type="button"
              class="flex-1 rounded-full border px-3 py-2 text-xs font-medium transition-colors"
              :class="
                preferences.preferences.clock === option.value
                  ? 'border-ink bg-ink text-ink-inverse'
                  : 'border-line text-ink-muted'
              "
              :aria-pressed="preferences.preferences.clock === option.value"
              @click="preferences.setClock(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <p class="tabular mt-1.5 text-xs text-ink-subtle">
            Times read like {{ preferences.formatClock(1110) }}.
          </p>
        </div>
      </div>
    </section>

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
        <p class="text-sm font-medium text-ink">Back up and restore</p>
        <p class="mt-1 text-xs text-ink-muted">
          Everything lives on this device only. Exporting writes a single file you can keep
          somewhere safe; restoring reads one back and replaces what is here.
        </p>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-xs font-medium text-ink-inverse transition-transform active:scale-95 disabled:opacity-50"
            :disabled="isExporting || isWorking"
            @click="exportData"
          >
            <AppSpinner v-if="isExporting" :size="12" label="Exporting" />
            Export
          </button>
          <button
            type="button"
            class="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-xs font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
            :disabled="isWorking"
            @click="importData"
          >
            <AppSpinner v-if="isWorking" :size="12" label="Restoring" />
            Import
          </button>
        </div>
      </div>

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
