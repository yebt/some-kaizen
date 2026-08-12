import { computed, ref } from 'vue'

import { CANCEL_TOLERANCE_PX, LONG_PRESS_MS, type PointerLike } from '../drag/use-drag-and-drop'

export interface PressHoldOptions {
  /** Fired the moment the press completes, not when the finger is lifted. */
  onHold: (key: string) => void
  holdMs?: number
}

/**
 * A hold that opens something, as opposed to a hold that picks something up.
 *
 * Deliberately a separate gesture from the drag, because the two fire at different moments:
 * a drag arms on hold and acts on release, while this acts the instant the hold completes,
 * so the menu is already open under the finger. It is only ever attached to lists, which
 * carry no drag, so the two never compete for the same press.
 *
 * The wander tolerance is shared with the drag: a finger that travels is scrolling, and a
 * list has to stay scrollable.
 */
export function usePressHold(options: PressHoldOptions) {
  const holdMs = options.holdMs ?? LONG_PRESS_MS

  const pendingKey = ref<string | null>(null)

  let pointerId: number | null = null
  let origin: { x: number; y: number } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancel() {
    clearTimeout(timer)
    timer = undefined
    pointerId = null
    origin = null
    pendingKey.value = null
  }

  function press(key: string, event: PointerLike): void {
    cancel()

    pendingKey.value = key
    pointerId = event.pointerId
    origin = { x: event.clientX, y: event.clientY }

    timer = setTimeout(() => {
      // Cleared before firing, so the item stops looking pressed the moment the menu opens.
      cancel()
      options.onHold(key)
    }, holdMs)
  }

  function move(event: PointerLike): void {
    if (pointerId === null || event.pointerId !== pointerId || !origin) return

    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > CANCEL_TOLERANCE_PX) {
      cancel()
    }
  }

  /** A press released early is an ordinary tap, so nothing happens beyond dropping the hold. */
  function release(event: PointerLike): void {
    if (pointerId !== null && event.pointerId !== pointerId) return

    cancel()
  }

  return { pendingKey: computed(() => pendingKey.value), press, move, release, cancel }
}
