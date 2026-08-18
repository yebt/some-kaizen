<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

defineProps<{ title: string; icon: IconName; description: string }>()
</script>

<template>
  <div class="safe-top">
    <header class="pt-2 pb-4">
      <h1 class="text-2xl font-semibold tracking-tight text-ink">{{ title }}</h1>
    </header>

    <div
      class="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-10 text-center"
    >
      <span class="grid size-12 place-items-center rounded-full bg-surface-sunken text-ink-subtle">
        <AppIcon :name="icon" :size="24" />
      </span>
      <p class="text-sm text-ink-muted">{{ description }}</p>
    </div>
  </div>
</template>
