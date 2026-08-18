<script setup lang="ts">
withDefaults(defineProps<{ size?: number; label?: string }>(), {
  size: 18,
  label: 'Loading',
})
</script>

<template>
  <span
    class="inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none"
    :style="{ width: `${size}px`, height: `${size}px` }"
    role="status"
    :aria-label="label"
  />
</template>
