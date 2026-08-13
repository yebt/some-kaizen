<script setup lang="ts">
withDefaults(
  defineProps<{
    position: { x: number; y: number } | null
    label: string
    /**
     * The exact rectangle the thing occupied before it was lifted.
     *
     * A ghost that changes width, height or horizontal position is not the same object being
     * carried — it is a new one that appeared, and the eye has to work out what happened to
     * the old one. Passing the real box means the card in the air is the card on the ruler.
     */
    box?: { readonly width: number; readonly left: number; readonly height: number }
    /**
     * How far below the box's own top the finger is holding it, in pixels.
     *
     * Without it the box's top edge snaps to the finger the instant the card is picked up,
     * which reads as the card having been moved before the drag has moved anything.
     */
    grabbedOffset?: number
    detail?: string
  }>(),
  { box: undefined, grabbedOffset: 0, detail: undefined },
)
</script>

<template>
  <!--
    pointer-events:none is load bearing, not decoration. The ghost sits directly under the
    finger, so without it every hit test would find the ghost instead of the day being
    aimed at, and nothing would ever drop.
  -->
  <div
    v-if="position && box"
    class="pointer-events-none fixed z-50 flex flex-col justify-center overflow-hidden rounded-md border-2 border-line-strong bg-surface px-2.5 py-1 opacity-90 shadow-float"
    :style="{
      left: `${box.left}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
      /* Only the vertical position follows the finger: a card can move in time and nowhere else. */
      top: `${position.y - grabbedOffset}px`,
    }"
    aria-hidden="true"
  >
    <p class="truncate pr-6 text-xs font-medium text-ink">{{ label }}</p>
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
