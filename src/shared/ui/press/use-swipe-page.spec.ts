import { describe, expect, it, vi } from 'vitest'

import { AXIS_LOCK_PX, COMMIT_PX, type SwipeDirection } from './use-swipe-action'
import { useSwipePage } from './use-swipe-page'

function pointer(x: number, y: number, pointerId = 1) {
  return { pointerId, clientX: x, clientY: y }
}

function setup() {
  const swiped: SwipeDirection[] = []
  const page = useSwipePage({ onSwipe: (direction) => swiped.push(direction) })

  return { page, swiped }
}

describe('paging by dragging sideways', () => {
  it('goes back when the finger travels right', () => {
    const { page, swiped } = setup()

    page.press(pointer(100, 100))
    page.move(pointer(100 + COMMIT_PX, 100))
    page.release(pointer(100 + COMMIT_PX, 100))

    expect(swiped).toEqual(['right'])
  })

  it('goes forward when it travels left', () => {
    const { page, swiped } = setup()

    page.press(pointer(300, 100))
    page.move(pointer(300 - COMMIT_PX, 100))
    page.release(pointer(300 - COMMIT_PX, 100))

    expect(swiped).toEqual(['left'])
  })

  it('ignores a nudge, so a twitch never changes the day', () => {
    const { page, swiped } = setup()

    page.press(pointer(100, 100))
    page.move(pointer(100 + AXIS_LOCK_PX + 1, 100))
    page.release(pointer(100 + AXIS_LOCK_PX + 1, 100))

    expect(swiped).toEqual([])
  })

  it('hands a vertical gesture back, so a tall day stays scrollable', () => {
    const { page, swiped } = setup()

    page.press(pointer(100, 100))
    page.move(pointer(100, 100 + AXIS_LOCK_PX + 1))
    page.move(pointer(100 + COMMIT_PX, 100 + AXIS_LOCK_PX + 1))
    page.release(pointer(100 + COMMIT_PX, 100 + AXIS_LOCK_PX + 1))

    expect(swiped).toEqual([])
  })

  it('will not change its mind once the axis is decided', () => {
    // A diagonal drag that flipped to horizontal halfway down would page the day out from
    // under the finger mid-scroll.
    const { page, swiped } = setup()

    page.press(pointer(100, 100))
    page.move(pointer(102, 100 + AXIS_LOCK_PX + 1))
    page.move(pointer(100 + COMMIT_PX * 2, 100 + AXIS_LOCK_PX + 1))
    page.release(pointer(100 + COMMIT_PX * 2, 100 + AXIS_LOCK_PX + 1))

    expect(swiped).toEqual([])
  })

  it('ignores a second finger arriving mid gesture', () => {
    const { page, swiped } = setup()

    page.press(pointer(100, 100))
    page.move(pointer(100 + COMMIT_PX, 100, 2))
    page.release(pointer(100 + COMMIT_PX, 100, 2))

    expect(swiped).toEqual([])
  })

  it('forgets a cancelled gesture rather than firing it late', () => {
    const { page, swiped } = setup()

    page.press(pointer(100, 100))
    page.move(pointer(100 + COMMIT_PX, 100))
    page.cancel()
    page.release(pointer(100 + COMMIT_PX, 100))

    expect(swiped).toEqual([])
  })

  it('never fires without a press, however far a stray move travels', () => {
    const { page, swiped } = setup()
    const onSwipe = vi.fn<() => void>()

    page.move(pointer(400, 100))
    page.release(pointer(400, 100))

    expect(swiped).toEqual([])
    expect(onSwipe).not.toHaveBeenCalled()
  })
})
