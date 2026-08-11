<script setup lang="ts">
defineProps<{ position: { x: number; y: number } | null; label: string }>()
</script>

<template>
  <!--
    pointer-events:none is load bearing, not decoration. The ghost sits directly under the
    finger, so without it every hit test would find the ghost instead of the day being
    aimed at, and nothing would ever drop.
  -->
  <div
    v-if="position"
    class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-inverse shadow-float"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    aria-hidden="true"
  >
    {{ label }}
  </div>
</template>
