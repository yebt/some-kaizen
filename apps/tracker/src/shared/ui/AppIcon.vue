<script setup lang="ts">
import { computed } from 'vue'

import { ICONS, type IconName } from './icons'

const props = withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 22 })

const component = computed(() => ICONS[props.name])
</script>

<template>
  <!-- Stroke weight is set here, once, so the whole set stays visually consistent. -->
  <component :is="component" :size="size" :stroke-width="1.6" aria-hidden="true" />
</template>
