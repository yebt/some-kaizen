<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppSpinner from '@shared/ui/AppSpinner.vue'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import type { BlockTime } from '@modules/block-time/domain/block-time'
import { useBlockTime, useSaveBlockTime } from '@modules/block-time/application/block-time-queries'
import BlockTimeForm from '@modules/block-time/ui/BlockTimeForm.vue'

const route = useRoute()
const router = useRouter()
const { data: blocksData, isLoading } = useBlockTime()
const saveBlock = useSaveBlockTime()
const feedback = useFeedback()
const form = useTemplateRef<{ reject: (message: string) => void }>('form')

const blockId = computed(() => {
  const raw = route.params.id

  return Array.isArray(raw) ? raw[0] : raw
})

const block = computed(() =>
  (blocksData.value ?? []).find((candidate) => candidate.id === blockId.value),
)

async function save(edited: BlockTime) {
  try {
    await saveBlock.mutateAsync(edited)
    feedback.notify(`${edited.name} saved`, 'success')
    await router.push('/block-time')
  } catch (error) {
    form.value?.reject(error instanceof Error ? error.message : 'That block could not be saved.')
  }
}
</script>

<template>
  <div class="safe-top">
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">Edit block</h1>
    </header>

    <div
      v-if="isLoading && blocksData === undefined"
      class="flex justify-center py-12 text-ink-subtle"
    >
      <AppSpinner :size="24" label="Loading the block" />
    </div>

    <p
      v-else-if="!block"
      class="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted"
    >
      That block no longer exists. It may have been removed on this device.
    </p>

    <BlockTimeForm
      v-else
      ref="form"
      :key="block.id"
      :initial="block"
      submit-label="Save"
      :busy="saveBlock.isLoading.value"
      @submit="save"
    />
  </div>
</template>
