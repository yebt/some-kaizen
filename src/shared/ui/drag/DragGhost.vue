<script setup lang="ts">
withDefaults(
  defineProps<{
    position: { x: number; y: number } | null
    label: string
    /**
     * The footprint the thing will occupy when it lands.
     *
     * A pill under the finger says what is being carried and nothing about what will happen
     * when it is dropped. On a timeline the answer is mostly a shape: a card that turns out
     * to be twice as tall as expected has already overlapped the next hour by the time you
     * find out.
     */
    height?: number
    detail?: string
  }>(),
  { height: undefined, detail: undefined },
)
</script>

<template>
  <!--
    pointer-events:none is load bearing, not decoration. The ghost sits directly under the
    finger, so without it every hit test would find the ghost instead of the day being
    aimed at, and nothing would ever drop.
  -->
  <div
    v-if="position && height !== undefined"
    class="pointer-events-none fixed z-50 flex w-40 -translate-x-1/2 flex-col justify-center overflow-hidden rounded-md border-2 border-line-strong bg-surface px-2.5 py-1 opacity-90 shadow-float"
    :style="{ left: `${position.x}px`, top: `${position.y}px`, height: `${height}px` }"
    aria-hidden="true"
  >
    <p class="truncate text-xs font-medium text-ink">{{ label }}</p>
    <p v-if="detail" class="tabular truncate text-[0.625rem] text-ink-muted">{{ detail }}</p>
  </div>

  <div
    v-else-if="position"
    class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink px-3.5 py-2 text-xs font-medium text-ink-inverse shadow-float"
    :style="{ left: `${position.x}px`, top: `${position.y}px` }"
    aria-hidden="true"
  >
    {{ label }}
  </div>
</template>
