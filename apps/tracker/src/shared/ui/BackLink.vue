<script setup lang="ts">
import { useRouter } from 'vue-router'

import AppIcon from './AppIcon.vue'

const props = defineProps<{ to: string; label: string }>()

const router = useRouter()

/**
 * Goes back through history when there is history to go back through.
 *
 * Returning to the given route is the fallback rather than the default, so arriving here
 * from a list and pressing back lands where you came from instead of somewhere plausible.
 * The fallback matters because this screen can also be opened cold from a link or a
 * notification, where there is nothing behind it.
 */
function goBack() {
  if (globalThis.history?.state?.back) router.back()
  else void router.push(props.to)
}
</script>

<template>
  <button
    type="button"
    class="-ml-1 flex items-center gap-1 rounded-full py-1 pr-2 pl-1 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
    @click="goBack"
  >
    <AppIcon name="chevron-left" :size="16" />
    {{ label }}
  </button>
</template>
