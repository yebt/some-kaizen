<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

const TABS: ReadonlyArray<{ to: string; icon: IconName; label: string }> = [
  { to: '/', icon: 'grid', label: 'Today' },
  { to: '/habits', icon: 'person', label: 'Habits' },
  { to: '/plan', icon: 'chart', label: 'Plan' },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]

defineEmits<{ create: [] }>()
</script>

<template>
  <nav
    class="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
    aria-label="Main"
  >
    <div
      class="pointer-events-auto flex items-center gap-1 rounded-full border border-line bg-surface/90 p-1.5 shadow-float backdrop-blur-xl"
    >
      <RouterLink
        v-for="tab in TABS.slice(0, 2)"
        :key="tab.to"
        :to="tab.to"
        class="grid size-11 place-items-center rounded-full text-ink-subtle transition-colors hover:text-ink"
        active-class="bg-accent text-accent-ink"
        :aria-label="tab.label"
      >
        <AppIcon :name="tab.icon" />
      </RouterLink>

      <button
        type="button"
        class="grid size-11 place-items-center rounded-full bg-ink text-ink-inverse transition-transform active:scale-92"
        aria-label="Add habit"
        @click="$emit('create')"
      >
        <AppIcon name="plus" />
      </button>

      <RouterLink
        v-for="tab in TABS.slice(2)"
        :key="tab.to"
        :to="tab.to"
        class="grid size-11 place-items-center rounded-full text-ink-subtle transition-colors hover:text-ink"
        active-class="bg-accent text-accent-ink"
        :aria-label="tab.label"
      >
        <AppIcon :name="tab.icon" />
      </RouterLink>
    </div>
  </nav>
</template>
