<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'

/**
 * Four places to go, and nothing to press.
 *
 * There was a fifth control in the middle that added a habit, from every screen, and it was
 * the loudest thing in the app. It was also wrong on most of them: standing on the blocks
 * screen, the obvious reading of a plus at the bottom is "add a block", and it opened a habit
 * form. Making it mean something different per screen would have been worse — a control fixed
 * to every screen that quietly changes meaning is one you learn once and get betrayed by the
 * second time — and hiding a menu behind a long press only helped somebody who already knew
 * the menu was there.
 *
 * So creating lives on the screen that holds that kind of thing, where the button can say
 * which kind it makes. And the most valuable place in the app stops being occupied by
 * something almost nobody does twice: the daily loop is answering and arranging, not adding.
 */
const TABS: ReadonlyArray<{ to: string; icon: IconName; label: string }> = [
  { to: '/', icon: 'grid', label: 'Today' },
  { to: '/habits', icon: 'person', label: 'Habits' },
  { to: '/plan', icon: 'chart', label: 'Plan' },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]
</script>

<template>
  <nav
    class="safe-bottom pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4"
    aria-label="Main"
  >
    <div
      class="pointer-events-auto flex items-center gap-1 rounded-full border border-line-strong bg-surface/90 p-1.5 shadow-float backdrop-blur-xl"
    >
      <RouterLink
        v-for="tab in TABS"
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
