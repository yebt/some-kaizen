<script setup lang="ts">
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
    class="touch-none select-none"
    @pointerdown="onPointerDown"
    @pointermove="emit('move', $event)"
    @pointerup="emit('release', $event)"
    @pointercancel="emit('cancel')"
  >
    <slot />
  </div>
</template>
