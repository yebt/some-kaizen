import { ref } from 'vue'

import { type PointerLike } from '../drag/use-drag-and-drop'
import { AXIS_LOCK_PX, COMMIT_PX, type SwipeDirection } from './use-swipe-action'

export interface SwipePageOptions {
  /** `right` means the finger travelled right, which reads as going back a page. */
  onSwipe: (direction: SwipeDirection) => void
  commitPx?: number
}

/**
 * A horizontal swipe across a whole surface, to move between pages of it.
 *
 * The same recogniser as a row swipe and deliberately none of the following: a row slides
 * because the label revealed underneath is the point, whereas a week or a day has nowhere to
 * slide to until it has actually changed. Reusing the row's offset here would drag the
 * timeline off its own gutter for a gesture that might yet be abandoned.
 *
 * Axis locking is the part that matters. A day timeline is a tall scrolling surface, so a
 * gesture that claimed every direction would make it unscrollable; the first ten pixels
 * decide, and a vertical decision hands the gesture back to the browser for good.
 */
export function useSwipePage(options: SwipePageOptions) {
  const commitPx = options.commitPx ?? COMMIT_PX

  const isTracking = ref(false)

  let pointerId: number | null = null
  let origin: { x: number; y: number } | null = null
  let axis: 'horizontal' | 'vertical' | null = null

  function cancel() {
    pointerId = null
    origin = null
    axis = null
    isTracking.value = false
  }

  function press(event: PointerLike): void {
    cancel()

    pointerId = event.pointerId
    origin = { x: event.clientX, y: event.clientY }
    isTracking.value = true
  }

  function move(event: PointerLike): void {
    if (pointerId === null || event.pointerId !== pointerId || !origin) return

    const travelledX = event.clientX - origin.x
    const travelledY = event.clientY - origin.y

    if (axis === null) {
      if (Math.max(Math.abs(travelledX), Math.abs(travelledY)) < AXIS_LOCK_PX) return

      axis = Math.abs(travelledX) > Math.abs(travelledY) ? 'horizontal' : 'vertical'

      // A vertical decision is final. Re-testing on every move would let a diagonal drag
      // flip to horizontal halfway down a scroll and page the day out from under the finger.
      if (axis === 'vertical') cancel()
    }
  }

  function release(event: PointerLike): void {
    if (pointerId === null || event.pointerId !== pointerId || !origin) return

    const travelled = event.clientX - origin.x
    const committed = axis === 'horizontal' && Math.abs(travelled) >= commitPx

    cancel()

    if (committed) options.onSwipe(travelled > 0 ? 'right' : 'left')
  }

  return { isTracking, press, move, release, cancel }
}
