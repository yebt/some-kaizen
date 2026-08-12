<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue'

import { buildPreviewDataset } from '@shared/dev/preview-dataset'
import AppDialog from '@shared/ui/AppDialog.vue'
import AppIcon from '@shared/ui/AppIcon.vue'
import AppSpinner from '@shared/ui/AppSpinner.vue'
import SegmentedControl from '@shared/ui/SegmentedControl.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { usePersistence } from '@core/persistence-context'
import { usePlatform } from '@core/platform-context'
import { usePreferences } from '@core/preferences-store'
import { useHabits } from '@modules/habits/application/habit-queries'
import { readDataset, useReplaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'
import { parseBackup, serializeDataset } from '@modules/data/domain/data-transfer'
import { backupFileName } from '@modules/data/domain/file-exchange'
import { mergeDataset, type MergeReport } from '@modules/data/domain/merge'

const { data: habitsData } = useHabits()
const persistence = usePersistence()
const replaceDataset = useReplaceDataset()
const feedback = useFeedback()
const files = usePlatform().files
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

/**
 * The destructive actions are folded away.
 *
 * Not for tidiness. "Load demo data" replaces everything you have, which makes it exactly as
 * dangerous as "Clear everything" and nothing like the backup buttons it used to sit beside.
 * Putting both behind a deliberate tap is the difference between a mistake being possible
 * and being easy.
 */
const showDangerous = ref(false)

/**
 * The result of folding a chosen file into what is here, held until it is accepted.
 *
 * Shallow on purpose. A deep ref wraps every record in a reactive proxy, and IndexedDB
 * stores values by structured clone, which refuses a proxy outright — so the merged dataset
 * would parse, preview correctly, and then fail the moment it was written.
 */
const pending = shallowRef<MergeReport | null>(null)

const pendingSummary = computed(() => {
  const report = pending.value

  if (!report) return []

  return [
    { label: 'habits', value: report.added.habits },
    { label: 'recorded days', value: report.added.entries },
    { label: 'occurrences', value: report.added.instances },
    { label: 'blocks', value: report.added.blocks },
  ].filter((entry) => entry.value > 0)
})

const pendingIsEmpty = computed(
  () => pendingSummary.value.length === 0 && (pending.value?.superseded ?? 0) === 0,
)

const theme = computed({
  get: () => preferences.preferences.theme,
  set: (value) => preferences.setTheme(value as (typeof THEMES)[number]['value']),
})

const clock = computed({
  get: () => preferences.preferences.clock,
  set: (value) => preferences.setClock(value as (typeof CLOCKS)[number]['value']),
})

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
    // Parsed before anything is asked or written, so a corrupt file is refused whole rather
    // than leaving half an import behind.
    incoming = parseBackup(text)
  } catch (error) {
    feedback.notify(
      error instanceof Error ? error.message : 'That file could not be read.',
      'danger',
    )

    return
  }

  // Merged rather than applied, and shown before anything is written. A backup is usually
  // the other half of your data rather than a correction of it.
  pending.value = mergeDataset(await readDataset(persistence), incoming)
}

async function applyImport() {
  const report = pending.value

  pending.value = null

  if (!report) return

  await replaceDataset.mutateAsync(report.dataset)
  feedback.notify('Import merged', 'success')
}

/**
 * Overwrites everything with a file, as distinct from folding one in.
 *
 * Merging is the right default and replacing is the right escape hatch: sometimes the file
 * is the truth and whatever this device has drifted into is not. It lives with the other
 * destructive actions rather than beside Import, because the two read almost identically in
 * a menu and only one of them can lose a year of records.
 */
async function replaceFromBackup() {
  const text = await files.pick()

  if (!text) return

  let incoming

  try {
    incoming = parseBackup(text)
  } catch (error) {
    feedback.notify(
      error instanceof Error ? error.message : 'That file could not be read.',
      'danger',
    )

    return
  }

  const accepted = await feedback.confirm({
    title: 'Replace everything with this file?',
    message: `It contains ${incoming.habits.length} habits and ${incoming.entries.length} recorded days. Everything currently on this device is deleted, including anything the file does not contain.`,
    confirmLabel: 'Replace everything',
    tone: 'danger',
  })

  if (!accepted) return

  await replaceDataset.mutateAsync(incoming)
  feedback.notify('Everything replaced from the backup', 'danger')
}

async function loadDemoData() {
  const accepted = await feedback.confirm({
    title: 'Load demo data?',
    message: 'This replaces everything currently stored on this device with a worked example.',
    confirmLabel: 'Replace',
    tone: 'danger',
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
        {{ habitCount }} {{ habitCount === 1 ? 'habit' : 'habits' }} on this device
      </p>
    </header>

    <section class="mb-5" aria-labelledby="appearance-heading">
      <h2
        id="appearance-heading"
        class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
      >
        Appearance
      </h2>

      <div class="space-y-4 rounded-card border border-line bg-surface p-4 shadow-card">
        <div>
          <p class="mb-2 text-sm font-medium text-ink">Theme</p>
          <SegmentedControl v-model="theme" :segments="THEMES" label="Theme" />
          <p class="mt-1.5 text-xs text-ink-subtle">
            System follows the phone, so an evening switch to dark takes the app with it.
          </p>
        </div>

        <div>
          <p class="mb-2 text-sm font-medium text-ink">Clock</p>
          <SegmentedControl v-model="clock" :segments="CLOCKS" label="Clock" />
          <p class="tabular mt-1.5 text-xs text-ink-subtle">
            Times read like {{ preferences.formatClock(1110) }}.
          </p>
        </div>
      </div>
    </section>

    <section class="mb-5" aria-labelledby="day-heading">
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

    <section class="mb-5" aria-labelledby="backup-heading">
      <h2
        id="backup-heading"
        class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
      >
        Backup
      </h2>

      <div class="rounded-card border border-line bg-surface p-4 shadow-card">
        <p class="text-xs text-ink-muted">
          Everything lives on this device only. Exporting writes a single file you can keep
          somewhere safe; importing folds one back in, adding what is missing without removing
          anything.
        </p>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs font-medium text-ink-inverse transition-transform active:scale-95 disabled:opacity-50"
            :disabled="isExporting || isWorking"
            @click="exportData"
          >
            <AppSpinner v-if="isExporting" :size="12" label="Exporting" />
            Export
          </button>
          <button
            type="button"
            class="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-line px-4 py-2.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
            :disabled="isWorking"
            @click="importData"
          >
            <AppSpinner v-if="isWorking" :size="12" label="Restoring" />
            Import
          </button>
        </div>
      </div>
    </section>

    <section aria-labelledby="danger-heading">
      <h2
        id="danger-heading"
        class="mb-2 text-xs font-semibold tracking-wide text-ink-muted uppercase"
      >
        Replace everything
      </h2>

      <button
        v-if="!showDangerous"
        type="button"
        class="flex w-full items-center gap-3 rounded-card border border-dashed border-line p-4 text-left"
        @click="showDangerous = true"
      >
        <span class="min-w-0 flex-1">
          <span class="block text-sm font-medium text-ink-muted">
            Show the destructive actions
          </span>
          <span class="mt-0.5 block text-xs text-ink-subtle">
            Loading the demo and clearing both wipe what you have.
          </span>
        </span>
        <AppIcon name="chevron-right" :size="18" />
      </button>

      <div v-else class="space-y-2">
        <div class="rounded-card border border-line bg-surface p-4 shadow-card">
          <p class="text-sm font-medium text-ink">Replace with a backup</p>
          <p class="mt-1 text-xs text-ink-muted">
            Makes a file the whole truth: everything here is deleted first, including anything the
            file does not contain. Import merges instead, and is what you usually want.
          </p>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-2 rounded-full border border-relapse px-4 py-2 text-xs font-medium text-relapse disabled:opacity-50"
            :disabled="isWorking"
            @click="replaceFromBackup"
          >
            <AppSpinner v-if="isWorking" :size="12" label="Working" />
            Replace from a file
          </button>
        </div>

        <div class="rounded-card border border-line bg-surface p-4 shadow-card">
          <p class="text-sm font-medium text-ink">Load demo data</p>
          <p class="mt-1 text-xs text-ink-muted">
            A worked example: two positive habits, one measured, one to quit, plus sleep and work as
            block time. Replaces everything you have.
          </p>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-2 rounded-full border border-relapse px-4 py-2 text-xs font-medium text-relapse disabled:opacity-50"
            :disabled="isWorking"
            @click="loadDemoData"
          >
            <AppSpinner v-if="isWorking" :size="12" label="Working" />
            Replace with demo data
          </button>
        </div>

        <div class="rounded-card border border-line bg-surface p-4 shadow-card">
          <p class="text-sm font-medium text-ink">Clear everything</p>
          <p class="mt-1 text-xs text-ink-muted">
            Deletes every habit, entry and block from this device. This cannot be undone, so export
            first if there is any doubt.
          </p>
          <button
            type="button"
            class="mt-3 inline-flex items-center gap-2 rounded-full bg-relapse px-4 py-2 text-xs font-medium text-ink-inverse disabled:opacity-50"
            :disabled="isWorking"
            @click="clearEverything"
          >
            <AppSpinner v-if="isWorking" :size="12" label="Working" />
            Clear everything
          </button>
        </div>
      </div>
    </section>

    <AppDialog :open="pending !== null" label="Import summary" @dismiss="pending = null">
      <h2 class="text-base font-semibold text-ink">Merge this file?</h2>

      <p v-if="pendingIsEmpty" class="mt-2 text-sm text-ink-muted">
        Everything in it is already here. Nothing would change.
      </p>
      <div v-else class="mt-2 space-y-1">
        <p v-for="entry in pendingSummary" :key="entry.label" class="tabular text-sm text-ink">
          <span class="font-semibold">+{{ entry.value }}</span>
          <span class="text-ink-muted"> {{ entry.label }}</span>
        </p>
        <p v-if="pending && pending.superseded > 0" class="tabular text-sm text-ink">
          <span class="font-semibold">{{ pending.superseded }}</span>
          <span class="text-ink-muted"> days answered more recently in the file</span>
        </p>
      </div>

      <p class="mt-2 text-xs text-ink-subtle">
        Nothing is removed. A record the file does not mention stays exactly as it is.
      </p>

      <div v-if="pending && pending.collisions.length" class="mt-4">
        <p class="mb-1.5 text-xs font-semibold tracking-wide text-ink-muted uppercase">
          {{ pending.collisions.length }}
          {{ pending.collisions.length === 1 ? 'collision' : 'collisions' }}
        </p>
        <ul class="max-h-40 space-y-1.5 overflow-y-auto">
          <li
            v-for="collision in pending.collisions"
            :key="`${collision.kind}-${collision.id}`"
            class="rounded-cell bg-surface-sunken p-2.5"
          >
            <p class="truncate text-xs font-medium text-ink">{{ collision.label }}</p>
            <p class="text-[0.6875rem] text-ink-muted">{{ collision.detail }}</p>
          </li>
        </ul>
      </div>

      <div class="mt-5 flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink-muted"
          @click="pending = null"
        >
          Cancel
        </button>
        <button
          type="button"
          class="flex-1 rounded-full bg-ink px-4 py-2.5 text-sm font-medium text-ink-inverse active:scale-95 disabled:opacity-50"
          :disabled="pendingIsEmpty"
          @click="applyImport"
        >
          Merge
        </button>
      </div>
    </AppDialog>
  </div>
</template>
