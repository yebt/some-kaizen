<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Completion from 0 to 1. Values outside the range are clamped rather than drawn wrong. */
    value: number
    size?: number
    thickness?: number
    label?: string
  }>(),
  { size: 44, thickness: 4, label: undefined },
)

const clamped = computed(() => Math.min(Math.max(props.value, 0), 1))
const radius = computed(() => (props.size - props.thickness) / 2)
const circumference = computed(() => 2 * Math.PI * radius.value)
// The dash gap is the unfinished remainder, so the stroke reads as a filled arc.
const dashOffset = computed(() => circumference.value * (1 - clamped.value))
const percentage = computed(() => Math.round(clamped.value * 100))
</script>

<template>
  <div
    class="relative inline-grid place-items-center"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="img"
    :aria-label="label ?? `${percentage}% complete`"
  >
    <svg :width="size" :height="size" class="-rotate-90" aria-hidden="true">
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="var(--color-line)"
        :stroke-width="thickness"
      />
      <circle
        :cx="size / 2"
        :cy="size / 2"
        :r="radius"
        fill="none"
        stroke="var(--color-partial)"
        :stroke-width="thickness"
        stroke-linecap="round"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        class="transition-[stroke-dashoffset] duration-500 ease-out"
      />
    </svg>
    <span class="tabular absolute text-[0.625rem] font-semibold text-ink-muted">
      {{ percentage }}%
    </span>
  </div>
</template>
