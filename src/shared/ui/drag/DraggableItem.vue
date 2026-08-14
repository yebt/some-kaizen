<script setup lang="ts">
import { onBeforeUnmount, useTemplateRef, watch } from 'vue'

import { LONG_PRESS_MS } from './use-drag-and-drop'

const props = withDefaults(
  defineProps<{
    pending?: boolean
    dragging?: boolean
    /**
     * Whether this surface takes the whole gesture from the moment a finger lands.
     *
     * Off by default, which lets a finger scroll the page from a card — the timeline is
     * covered in them, and a day you cannot scroll from anywhere worth touching is not a day.
     *
     * On for anything sitting inside a scroller of its own. A chip in the drawer's list is
     * one wobble away from the browser deciding the gesture was a pan and cancelling the
     * hold, and the drawer exists for exactly one action: picking a chip up. There is nothing
     * to scroll towards that is worth losing that.
     */
    claim?: boolean
  }>(),
  { pending: false, dragging: false, claim: false },
)

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

const root = useTemplateRef<HTMLElement>('root')

/**
 * Refuses the browser's scroll, but only once the card has actually been picked up.
 *
 * `touch-action: none` did this by declaration and cost too much: it is read when the finger
 * lands, so a card claimed every gesture that started on it — including a scroll. On a
 * timeline where cards cover the busy hours, that meant the day could not be scrolled from
 * anywhere worth touching.
 *
 * `pan-y` gives the scroll back, and this takes it away again at the one moment it must:
 * after the hold has completed and the card is in the air. `touchmove` is the cancellable
 * event — `pointermove` is not — so the listener has to be a non-passive one of those.
 */
function refuseScroll(event: TouchEvent) {
  if (event.cancelable) event.preventDefault()
}

watch(
  () => props.dragging,
  (isDragging) => {
    const element = root.value

    if (!element) return

    if (isDragging) element.addEventListener('touchmove', refuseScroll, { passive: false })
    else element.removeEventListener('touchmove', refuseScroll)
  },
)

onBeforeUnmount(() => root.value?.removeEventListener('touchmove', refuseScroll))
</script>

<template>
  <!--
    `pan-y` rather than `none`: a finger that lands on a card and moves is scrolling, and it
    keeps scrolling until the hold has completed. Only then does the card take the gesture,
    which is what makes a timeline covered in cards still feel like a page.
  -->
  <div
    ref="root"
    class="grippable"
    :class="[
      claim ? 'touch-none' : 'touch-pan-y',
      pending && 'is-pending',
      dragging && 'is-dragging',
    ]"
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
