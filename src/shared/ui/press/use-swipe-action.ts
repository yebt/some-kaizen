import { computed, ref } from 'vue'

import type { PointerLike } from '../drag/use-drag-and-drop'

export type SwipeDirection = 'right' | 'left'

/** Movement needed before the gesture commits to an axis. Below this it could still be a scroll. */
export const AXIS_LOCK_PX = 10

/** How far the row must travel to count as a swipe rather than a nudge. */
export const COMMIT_PX = 72

/** The row stops following the finger here, so it never slides off its own list. */
export const MAX_OFFSET_PX = 132

export interface SwipeActionOptions {
  onSwipe: (key: string, direction: SwipeDirection) => void
  commitPx?: number
}

/**
 * A horizontal swipe on a list row.
 *
 * The axis is decided by whichever way the finger moves first, and a vertical decision
 * abandons the gesture entirely so the list keeps scrolling. Rows carry `touch-action:
 * pan-y`, which leaves vertical panning to the browser and hands us only the axis we want:
 * taking the whole gesture the way a drag does would make a long list unscrollable.
 *
 * Committing needs real distance. A swipe that fires on a twitch would mark habits done
 * every time someone flicks past them.
 */
export function useSwipeAction(options: SwipeActionOptions) {
  const commitPx = options.commitPx ?? COMMIT_PX

  const activeKey = ref<string | null>(null)
  const offset = ref(0)

  let pointerId: number | null = null
  let origin: { x: number; y: number } | null = null
  let axis: 'undecided' | 'horizontal' | 'vertical' = 'undecided'

  function reset() {
    pointerId = null
    origin = null
    axis = 'undecided'
    activeKey.value = null
    offset.value = 0
  }

  function press(key: string, event: PointerLike): void {
    reset()

    activeKey.value = key
    pointerId = event.pointerId
    origin = { x: event.clientX, y: event.clientY }
  }

  function move(event: PointerLike): void {
    if (pointerId === null || event.pointerId !== pointerId || !origin) return

    const dx = event.clientX - origin.x
    const dy = event.clientY - origin.y

    if (axis === 'undecided') {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK_PX) return

      axis = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'

      // A vertical decision is the list scrolling, and the row should not follow at all.
      if (axis === 'vertical') {
        reset()

        return
      }
    }

    // Deliberately falls through on the move that locks the axis. Returning here instead
    // would leave the row one event behind the finger, which reads as a stutter on the
    // first frame of every swipe.
    if (axis !== 'horizontal') return

    offset.value = Math.max(Math.min(dx, MAX_OFFSET_PX), -MAX_OFFSET_PX)
  }

  function release(event: PointerLike): void {
    if (pointerId !== null && event.pointerId !== pointerId) return

    const key = activeKey.value
    const travelled = offset.value

    reset()

    if (key === null || Math.abs(travelled) < commitPx) return

    options.onSwipe(key, travelled > 0 ? 'right' : 'left')
  }

  return {
    activeKey: computed(() => activeKey.value),
    offset: computed(() => offset.value),
    /** True once the row has travelled far enough that letting go would commit. */
    isArmed: computed(() => Math.abs(offset.value) >= commitPx),
    press,
    move,
    release,
    cancel: reset,
  }
}
