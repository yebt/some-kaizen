<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import ActionSheet, { type SheetAction } from './ActionSheet.vue'
import AppIcon from './AppIcon.vue'
import type { IconName } from './icons'
import { usePressHold } from './press/use-press-hold'

const TABS: ReadonlyArray<{ to: string; icon: IconName; label: string }> = [
  { to: '/', icon: 'grid', label: 'Today' },
  { to: '/habits', icon: 'person', label: 'Habits' },
  { to: '/plan', icon: 'chart', label: 'Plan' },
  { to: '/settings', icon: 'gear', label: 'Settings' },
]

/**
 * Everything the app can be given, in the order it is usually given them.
 *
 * A habit first because it is what the tap already does, and because reading the tap's
 * destination at the top of the list is what makes the tap learnable rather than a thing
 * you find out by pressing.
 */
const ADDABLE: ReadonlyArray<SheetAction & { to: string }> = [
  {
    key: 'habit',
    to: '/habits/new',
    label: 'Habit',
    description: 'Something you want to do, and how often',
  },
  {
    key: 'routine',
    to: '/routines/new',
    label: 'Routine',
    description: 'A part of the day, with its habits in order',
  },
  {
    key: 'block',
    to: '/block-time/new',
    label: 'Block of time',
    description: 'Hours already spoken for — sleep, work, the commute',
  },
  {
    key: 'challenge',
    to: '/challenges',
    label: 'Challenge',
    description: 'A fixed set of tasks for a fixed number of days',
  },
]

const router = useRouter()

const adding = ref(false)

/**
 * The plus adds a habit, and held, adds anything.
 *
 * The complaint that produced this was exact: standing on the blocks screen, the plus at the
 * bottom is obviously the way to add a block, and it opened a habit form. A control fixed to
 * every screen cannot quietly mean a different thing on each one — you learn it once and it
 * betrays you the second time — so it keeps one meaning and grows a second, deliberate one.
 *
 * A hold is not reachable from a keyboard, which is why this is a shortcut and never the only
 * route: every destination here is also a plain link on the habits screen. The context menu
 * is bound too, which is the same gesture for a mouse and the one key that reaches it.
 */
const hold = usePressHold({
  onHold: () => {
    adding.value = true
  },
})

const actions = computed<readonly SheetAction[]>(() =>
  ADDABLE.map(({ key, label, description }) => ({ key, label, description })),
)

/**
 * A button rather than a link, now that it has two meanings.
 *
 * As a link, the tap that ends a hold would follow the href as well, and the sheet would
 * open over a form nobody asked for. Suppressing that means racing the router's own click
 * handler; navigating ourselves means never being in the race.
 */
function tapped() {
  if (adding.value) return

  void router.push('/habits/new')
}

function choose(key: string) {
  const chosen = ADDABLE.find((action) => action.key === key)

  adding.value = false

  if (chosen) void router.push(chosen.to)
}
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
        aria-haspopup="menu"
        @click="tapped"
        @contextmenu.prevent="adding = true"
        @pointerdown="hold.press('add', $event)"
        @pointermove="hold.move($event)"
        @pointerup="hold.release($event)"
        @pointercancel="hold.cancel()"
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

  <ActionSheet
    :open="adding"
    title="Add"
    :actions="actions"
    @select="choose"
    @dismiss="adding = false"
  />
</template>
