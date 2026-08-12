<script setup lang="ts">
import AppDialog from './AppDialog.vue'

export interface SheetAction {
  readonly key: string
  readonly label: string
  readonly description?: string
  readonly tone?: 'neutral' | 'danger'
}

defineProps<{ open: boolean; title: string; actions: readonly SheetAction[] }>()

const emit = defineEmits<{ select: [key: string]; dismiss: [] }>()
</script>

<template>
  <AppDialog :open="open" :label="title" @dismiss="emit('dismiss')">
    <p class="mb-3 text-sm font-semibold text-ink">{{ title }}</p>

    <ul class="space-y-1.5">
      <li v-for="action in actions" :key="action.key">
        <button
          type="button"
          class="w-full rounded-cell px-3.5 py-3 text-left transition-colors hover:bg-surface-sunken"
          @click="emit('select', action.key)"
        >
          <span
            class="block text-sm font-medium"
            :class="action.tone === 'danger' ? 'text-relapse' : 'text-ink'"
          >
            {{ action.label }}
          </span>
          <span v-if="action.description" class="block text-xs text-ink-muted">
            {{ action.description }}
          </span>
        </button>
      </li>
    </ul>

    <button
      type="button"
      class="mt-3 w-full rounded-full border border-line px-4 py-2.5 text-sm font-medium text-ink-muted"
      @click="emit('dismiss')"
    >
      Cancel
    </button>
  </AppDialog>
</template>
