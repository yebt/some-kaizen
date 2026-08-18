<script setup lang="ts">
export interface Segment {
  readonly value: string
  readonly label: string
  readonly badge?: number
}

defineProps<{ segments: readonly Segment[]; label: string }>()

const model = defineModel<string>({ required: true })
</script>

<template>
  <!--
    Two views of the same day rather than one long scroll. A checklist and a timeline answer
    different questions — what must I do, and when does it happen — and stacking them meant
    a busy day pushed the timeline entirely off screen.
  -->
  <div
    class="flex gap-1 rounded-full border border-line-strong bg-surface-sunken p-1"
    role="tablist"
    :aria-label="label"
  >
    <button
      v-for="segment in segments"
      :key="segment.value"
      type="button"
      role="tab"
      class="flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors"
      :class="model === segment.value ? 'bg-surface text-ink shadow-card' : 'text-ink-muted'"
      :aria-selected="model === segment.value"
      @click="model = segment.value"
    >
      {{ segment.label }}
      <span
        v-if="segment.badge"
        class="tabular rounded-full px-1.5 py-0.5 text-[0.625rem]"
        :class="model === segment.value ? 'bg-ink text-ink-inverse' : 'bg-line text-ink-muted'"
      >
        {{ segment.badge }}
      </span>
    </button>
  </div>
</template>
