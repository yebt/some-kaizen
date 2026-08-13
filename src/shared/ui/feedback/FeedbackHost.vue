<script setup lang="ts">
import { computed } from 'vue'

import AppDialog from '@shared/ui/AppDialog.vue'

import { useFeedback } from './feedback-store'

const feedback = useFeedback()

const request = computed(() => feedback.request)
const isDanger = computed(() => request.value?.tone === 'danger')

const TOAST_TONE_CLASS = {
  neutral: 'bg-ink text-ink-inverse',
  success: 'bg-done text-ink-inverse',
  danger: 'bg-relapse text-ink-inverse',
} as const
</script>

<template>
  <AppDialog
    :open="request !== null"
    :label="request?.title ?? 'Confirm'"
    @dismiss="feedback.resolve(false)"
  >
    <h2 class="text-base font-semibold text-ink">{{ request?.title }}</h2>
    <p class="mt-2 text-sm text-ink-muted">{{ request?.message }}</p>

    <div class="mt-5 flex gap-2">
      <button
        type="button"
        class="flex-1 rounded-full border border-line-strong px-4 py-2.5 text-sm font-medium text-ink-muted transition-colors hover:text-ink"
        @click="feedback.resolve(false)"
      >
        {{ request?.cancelLabel ?? 'Cancel' }}
      </button>
      <button
        type="button"
        class="flex-1 rounded-full px-4 py-2.5 text-sm font-medium text-ink-inverse transition-transform active:scale-95"
        :class="isDanger ? 'bg-relapse' : 'bg-ink'"
        @click="feedback.resolve(true)"
      >
        {{ request?.confirmLabel ?? 'Confirm' }}
      </button>
    </div>
  </AppDialog>

  <!-- Announced politely: a toast confirms something that already happened. -->
  <div
    class="safe-bottom pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4"
    role="status"
    aria-live="polite"
  >
    <TransitionGroup
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-to-class="translate-y-2 opacity-0 motion-reduce:translate-y-0"
    >
      <button
        v-for="toast in feedback.toasts"
        :key="toast.id"
        type="button"
        class="pointer-events-auto max-w-sm rounded-full px-4 py-2.5 text-sm font-medium shadow-float"
        :class="TOAST_TONE_CLASS[toast.tone]"
        @click="feedback.dismiss(toast.id)"
      >
        {{ toast.message }}
      </button>
    </TransitionGroup>
  </div>
</template>
