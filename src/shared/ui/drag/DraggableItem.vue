<script setup lang="ts">
import { LONG_PRESS_MS } from './use-drag-and-drop'

withDefaults(defineProps<{ pending?: boolean; dragging?: boolean }>(), {
  pending: false,
  dragging: false,
})

const emit = defineEmits<{
  press: [event: PointerEvent]
  move: [event: PointerEvent]
  release: [event: PointerEvent]
  cancel: []
}>()

/**
 * Captures the pointer so the gesture keeps reporting once the finger leaves the element.
 *
 * Without capture, `pointermove` stops firing the instant the finger crosses the card's
 * edge, which is roughly two pixels into any real drag. The optional call is for jsdom,
 * which has no pointer capture at all.
 */
function onPointerDown(event: PointerEvent) {
  const target = event.currentTarget as Element & {
    setPointerCapture?: (pointerId: number) => void
  }

  target.setPointerCapture?.(event.pointerId)
  emit('press', event)
}
</script>

<template>
  <!--
    touch-action:none hands the whole gesture to us instead of letting the browser claim it
    for a scroll. Draggable items are kept small so a finger starting on empty space still
    scrolls the page normally.
  -->
  <div
    class="grippable touch-none"
    :class="[pending && 'is-pending', dragging && 'is-dragging']"
    :style="{ '--hold-duration': `${LONG_PRESS_MS}ms` }"
    @pointerdown="onPointerDown"
    @pointermove="emit('move', $event)"
    @pointerup="emit('release', $event)"
    @pointercancel="emit('cancel')"
  >
    <slot />
  </div>
</template>

<style scoped>
/*
 * A press that is still deciding needs to look like one.
 *
 * The card sinks and a ring closes in over exactly the hold duration, so the moment it
 * completes is the moment the card lifts. Without this, a long press feels like a dead
 * interface until it suddenly is not, and people let go early and conclude drag is broken.
 * The duration comes from the same constant the gesture uses, so the two cannot drift.
 */
.is-pending {
  animation: press-hold var(--hold-duration) ease-out forwards;
}

@keyframes press-hold {
  from {
    transform: scale(1);
    box-shadow: 0 0 0 10px oklch(from var(--color-ink) l c h / 0);
  }
  to {
    transform: scale(0.94);
    box-shadow: 0 0 0 3px oklch(from var(--color-ink) l c h / 0.35);
  }
}

/* Lifted once it is actually being carried, so picked-up and pressed never look alike. */
.is-dragging {
  opacity: 0.4;
  transform: scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .is-pending {
    animation: none;
    transform: scale(0.96);
  }
}
</style>
