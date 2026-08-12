<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'

import { useFeedback } from '@shared/ui/feedback/feedback-store'
import type { BlockTime } from '@modules/block-time/domain/block-time'
import { useSaveBlockTime } from '@modules/block-time/application/block-time-queries'
import BlockTimeForm from '@modules/block-time/ui/BlockTimeForm.vue'

const router = useRouter()
const saveBlock = useSaveBlockTime()
const feedback = useFeedback()
const form = useTemplateRef<{ reject: (message: string) => void }>('form')

async function create(block: BlockTime) {
  try {
    // Only the stored blocks can reveal a collision, so this rejection comes back from the
    // mutation rather than from the form's own checks.
    await saveBlock.mutateAsync(block)
    feedback.notify(`${block.name} added`, 'success')
    await router.push('/block-time')
  } catch (error) {
    form.value?.reject(error instanceof Error ? error.message : 'That block could not be saved.')
  }
}
</script>

<template>
  <div class="safe-top">
    <BackLink to="/block-time" label="Block time" />
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">New block</h1>
      <p class="text-sm text-ink-muted">Fixed commitments the rest of your day is built around.</p>
    </header>

    <BlockTimeForm
      ref="form"
      submit-label="Add block"
      :busy="saveBlock.isLoading.value"
      @submit="create"
    />
  </div>
</template>
