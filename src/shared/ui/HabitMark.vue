<script setup lang="ts">
import type { Appearance } from '@shared/domain/appearance'

import { surfaceStyle } from './appearance-style'
import { SYMBOL_ICONS } from './icons'

/**
 * The dot a habit is recognised by: its colour, its pattern, and its symbol inside them.
 *
 * One component rather than the same three lines on six screens, because the three parts have
 * to agree about size and about which of them wins when only some are set. A symbol with no
 * colour still needs drawing — plenty of people will choose one and leave the palette alone —
 * and a colour with no symbol has to keep looking exactly as it did before this existed.
 */
withDefaults(defineProps<{ appearance: Appearance; size?: number }>(), { size: 32 })
</script>

<template>
  <span
    v-if="appearance.colour || appearance.symbol"
    data-habit-mark
    class="grid shrink-0 place-items-center rounded-full border border-line"
    :style="[surfaceStyle(appearance), { width: `${size}px`, height: `${size}px` }]"
    aria-hidden="true"
  >
    <component
      :is="SYMBOL_ICONS[appearance.symbol]"
      v-if="appearance.symbol"
      :size="Math.round(size * 0.55)"
      :stroke-width="1.75"
    />
  </span>
</template>
