<script setup lang="ts">
import { computed } from 'vue'

import {
  PALETTE,
  PATTERNS,
  type PatternName,
  SYMBOLS,
  type SymbolName,
} from '@shared/domain/appearance'
import { contrastRatio, type HexColour, readableInkOn } from '@shared/domain/colour'
import { SYMBOL_ICONS } from './icons'

import { surfaceStyle } from './appearance-style'

const colour = defineModel<HexColour | undefined>('colour')
const pattern = defineModel<PatternName | undefined>('pattern')
const symbol = defineModel<SymbolName | undefined>('symbol')

const PATTERN_LABELS: Record<PatternName, string> = {
  solid: 'Solid',
  stripes: 'Stripes',
  dots: 'Dots',
  grid: 'Grid',
  diagonal: 'Diagonal',
}

/**
 * Reported so the choice is accountable rather than a matter of taste.
 *
 * The number is the ratio between the colour and the ink actually drawn on it, and 4.5 is
 * the threshold ordinary text has to clear.
 */
const contrast = computed(() => {
  if (!colour.value) return null

  return contrastRatio(colour.value, readableInkOn(colour.value)).toFixed(1)
})

const preview = computed(() => surfaceStyle({ colour: colour.value, pattern: pattern.value }))
</script>

<template>
  <div class="space-y-3">
    <div>
      <p class="mb-1.5 text-xs font-medium text-ink-muted">Colour</p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="size-9 rounded-full border-2 transition-transform active:scale-90"
          :class="colour === undefined ? 'border-ink' : 'border-line'"
          aria-label="No colour"
          :aria-pressed="colour === undefined"
          @click="colour = undefined"
        >
          <span class="block size-full rounded-full bg-surface-sunken" />
        </button>
        <button
          v-for="option in PALETTE"
          :key="option"
          type="button"
          class="size-9 rounded-full border-2 transition-transform active:scale-90"
          :class="colour === option ? 'border-ink' : 'border-transparent'"
          :style="{ backgroundColor: option }"
          :aria-label="`Colour ${option}`"
          :aria-pressed="colour === option"
          @click="colour = option"
        />
      </div>
    </div>

    <!--
      Offered before the colour, because it is the part that does the recognising. A drawn set
      at one stroke weight rather than emoji: an emoji is a different typeface on every
      platform, so a list styled on one phone is a different list on the next, and several of
      them carry a skin tone and a gender nobody chose.
    -->
    <div>
      <p class="mb-1.5 text-xs font-medium text-ink-muted">Symbol</p>
      <div class="flex flex-wrap gap-1.5">
        <button
          type="button"
          class="hit-area grid size-9 place-items-center rounded-full border text-xs text-ink-muted transition-colors"
          :class="symbol === undefined ? 'border-ink' : 'border-line'"
          aria-label="No symbol"
          :aria-pressed="symbol === undefined"
          @click="symbol = undefined"
        >
          —
        </button>
        <button
          v-for="option in SYMBOLS"
          :key="option"
          type="button"
          class="hit-area grid size-9 place-items-center rounded-full border transition-colors"
          :class="symbol === option ? 'border-ink text-ink' : 'border-line text-ink-muted'"
          :aria-label="option"
          :aria-pressed="symbol === option"
          @click="symbol = option"
        >
          <component :is="SYMBOL_ICONS[option]" :size="16" :stroke-width="1.75" />
        </button>
      </div>
    </div>

    <div v-if="colour">
      <p class="mb-1.5 text-xs font-medium text-ink-muted">Pattern</p>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="option in PATTERNS"
          :key="option"
          type="button"
          class="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            (pattern ?? 'solid') === option
              ? 'border-ink bg-ink text-ink-inverse'
              : 'border-line text-ink-muted'
          "
          :aria-pressed="(pattern ?? 'solid') === option"
          @click="pattern = option === 'solid' ? undefined : option"
        >
          {{ PATTERN_LABELS[option] }}
        </button>
      </div>
      <p class="mt-1.5 text-xs text-ink-subtle">
        A pattern keeps two habits apart when the colour cannot: in greyscale, in bright sun, or for
        the one person in twelve who cannot separate red from green.
      </p>
    </div>

    <div v-if="colour" class="flex items-center gap-3">
      <span
        class="grid h-12 flex-1 place-items-center rounded-cell text-xs font-medium"
        :style="preview"
      >
        Preview
      </span>
      <span class="tabular text-xs text-ink-subtle">{{ contrast }}:1</span>
    </div>
  </div>
</template>
