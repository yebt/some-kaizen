import { describe, expect, it } from 'vitest'

import { AXIS_LOCK_PX } from './use-swipe-action'
import { useDetentDrag } from './use-detent-drag'

const STEP = 40

function pointer(x: number, y: number, pointerId = 1) {
  return { pointerId, clientX: x, clientY: y }
}

function setup() {
  const settled: number[] = []
  const detents: number[] = []
  const drag = useDetentDrag({
    stepPx: STEP,
    onDetent: (steps) => detents.push(steps),
    onSettle: (steps) => settled.push(steps),
  })

  return { drag, settled, detents }
}

describe('a control that follows the finger', () => {
  it('reports where the finger is, not only where it ended', () => {
    // The whole difference from a swipe: the caller can draw the thing mid-gesture.
    const { drag } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 - STEP, 100))

    expect(drag.offset.value).toBe(-STEP)
  })

  it('settles on the value it is nearest, never between two', () => {
    const { drag, settled } = setup()

    drag.press(pointer(100, 100))
    // Two steps and a bit further: nearer three than two.
    drag.move(pointer(100 - STEP * 2.6, 100))
    drag.release(pointer(100 - STEP * 2.6, 100))

    expect(settled).toEqual([3])
  })

  it('rounds back down when the finger has not really got there', () => {
    const { drag, settled } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 - STEP * 2.4, 100))
    drag.release(pointer(100 - STEP * 2.4, 100))

    expect(settled).toEqual([2])
  })

  it('goes the other way when the finger does', () => {
    const { drag, settled } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 + STEP, 100))
    drag.release(pointer(100 + STEP, 100))

    expect(settled).toEqual([-1])
  })

  it('returns to rest so the control does not stay pushed over', () => {
    const { drag } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 - STEP, 100))
    drag.release(pointer(100 - STEP, 100))

    expect(drag.offset.value).toBe(0)
  })

  it('says nothing when the finger comes back to where it started', () => {
    const { drag, settled } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 - STEP * 2, 100))
    drag.move(pointer(100, 100))
    drag.release(pointer(100, 100))

    expect(settled).toEqual([])
  })

  it('ticks once per boundary crossed, not once per frame', () => {
    // A tick that repeats while a finger hovers on a boundary is a buzz, and a buzz is what
    // makes someone turn the whole thing off.
    const { drag, detents } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 - STEP, 100))
    drag.move(pointer(100 - STEP - 2, 100))
    drag.move(pointer(100 - STEP - 4, 100))

    expect(detents).toEqual([1])
  })

  it('ticks again on the way back', () => {
    const { drag, detents } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 - STEP, 100))
    drag.move(pointer(100, 100))

    expect(detents).toEqual([1, 0])
  })

  it('hands a vertical gesture back, so a page underneath stays scrollable', () => {
    const { drag, settled } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100, 100 + AXIS_LOCK_PX + 1))
    drag.move(pointer(100 - STEP * 3, 100 + AXIS_LOCK_PX + 1))
    drag.release(pointer(100 - STEP * 3, 100 + AXIS_LOCK_PX + 1))

    expect(settled).toEqual([])
    expect(drag.offset.value).toBe(0)
  })

  it('will not change its mind once the axis is decided', () => {
    const { drag, settled } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(102, 100 + AXIS_LOCK_PX + 1))
    drag.move(pointer(100 - STEP * 3, 100 + AXIS_LOCK_PX + 1))
    drag.release(pointer(100 - STEP * 3, 100 + AXIS_LOCK_PX + 1))

    expect(settled).toEqual([])
  })

  it('ignores a second finger arriving mid gesture', () => {
    const { drag, settled } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 - STEP * 2, 100, 2))
    drag.release(pointer(100 - STEP * 2, 100, 2))

    expect(settled).toEqual([])
  })

  it('forgets a cancelled gesture rather than settling it late', () => {
    const { drag, settled } = setup()

    drag.press(pointer(100, 100))
    drag.move(pointer(100 - STEP * 2, 100))
    drag.cancel()
    drag.release(pointer(100 - STEP * 2, 100))

    expect(settled).toEqual([])
  })
})
