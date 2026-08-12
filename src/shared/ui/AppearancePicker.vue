<script setup lang="ts">
import { computed } from 'vue'

import { PALETTE, PATTERNS, type PatternName } from '@shared/domain/appearance'
import { contrastRatio, type HexColour, readableInkOn } from '@shared/domain/colour'

import { surfaceStyle } from './appearance-style'

const colour = defineModel<HexColour | undefined>('colour')
const pattern = defineModel<PatternName | undefined>('pattern')

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
