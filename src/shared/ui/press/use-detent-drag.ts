import { computed, ref } from 'vue'

import type { PointerLike } from '../drag/use-drag-and-drop'
import { AXIS_LOCK_PX } from './use-swipe-action'

export interface DetentDragOptions {
  /** How far the finger travels for one step. Below this the control has not moved a value. */
  stepPx: number
  /** Fired each time a new step is crossed, for a tick that can be felt. */
  onDetent?: (steps: number) => void
  /** Fired once on release with the settled number of steps, positive meaning rightward. */
  onSettle: (steps: number) => void
}

/**
 * A control that follows the finger and settles on a valid value.
 *
 * The difference from a swipe is the middle of the gesture. A swipe is a verdict delivered on
 * release: nothing moves until it is over, and the only feedback is that something happened.
 * This reports continuously, so the thing being dragged can be drawn where the finger has put
 * it and the reader can see they are between two values before choosing one. On release it
 * lands on the nearest — a camera's zoom wheel rather than a pager.
 *
 * Half a value is never left showing. `offset` is what the caller draws with; `settled` is
 * what it commits to, and they are only equal at rest.
 */
export function useDetentDrag(options: DetentDragOptions) {
  /** How far the finger has travelled, for the caller to translate the control by. */
  const offset = ref(0)
  const isDragging = ref(false)

  let pointerId: number | null = null
  let origin: { x: number; y: number } | null = null
  let axis: 'horizontal' | 'vertical' | null = null
  let announced = 0

  /**
   * Whole steps the current travel represents, rounded to the one it is nearest.
   *
   * The `|| 0` is not decoration: rounding a small negative travel produces `-0`, which
   * compares equal to zero and prints as `-0`, so a caller logging or diffing detents sees a
   * value that looks like a bug and is not one.
   */
  const steps = computed(() => Math.round(-offset.value / options.stepPx) || 0)

  function reset() {
    offset.value = 0
    isDragging.value = false
    pointerId = null
    origin = null
    axis = null
    announced = 0
  }

  function press(event: PointerLike): void {
    reset()
    pointerId = event.pointerId
    origin = { x: event.clientX, y: event.clientY }
  }

  function move(event: PointerLike): void {
    if (pointerId === null || event.pointerId !== pointerId || !origin) return

    const travelledX = event.clientX - origin.x
    const travelledY = event.clientY - origin.y

    if (axis === null) {
      if (Math.max(Math.abs(travelledX), Math.abs(travelledY)) < AXIS_LOCK_PX) return

      // A vertical decision is final. Re-testing every move would let a diagonal drag flip
      // halfway down a scroll and move the control out from under the finger.
      axis = Math.abs(travelledX) > Math.abs(travelledY) ? 'horizontal' : 'vertical'

      if (axis === 'vertical') {
        reset()

        return
      }
    }

    isDragging.value = true
    offset.value = travelledX

    // Once per crossing, not once per frame: a tick that repeats while the finger hovers on a
    // boundary is a buzz, and a buzz is what makes someone turn the feature off.
    if (steps.value !== announced) {
      announced = steps.value
      options.onDetent?.(steps.value)
    }
  }

  function release(event: PointerLike): void {
    if (pointerId === null || event.pointerId !== pointerId) return

    const settled = steps.value

    reset()

    if (settled !== 0) options.onSettle(settled)
  }

  return { offset, isDragging, steps, press, move, release, cancel: reset }
}
