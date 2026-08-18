import { beforeEach, describe, expect, it } from 'vitest'

import { AXIS_LOCK_PX, COMMIT_PX, MAX_OFFSET_PX, useSwipeAction } from './use-swipe-action'

function pointer(x: number, y: number, pointerId = 1) {
  return { pointerId, clientX: x, clientY: y }
}

let swipes: Array<{ key: string; direction: string }>

function setup() {
  return useSwipeAction({ onSwipe: (key, direction) => swipes.push({ key, direction }) })
}

beforeEach(() => {
  swipes = []
})

describe('committing a swipe', () => {
  it('marks a row swiped right once it has travelled far enough', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(COMMIT_PX + 10, 0))
    swipe.release(pointer(COMMIT_PX + 10, 0))

    expect(swipes).toEqual([{ key: 'row-1', direction: 'right' }])
  })

  it('reports a swipe left separately, which is what undoing needs', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(-COMMIT_PX - 10, 0))
    swipe.release(pointer(-COMMIT_PX - 10, 0))

    expect(swipes).toEqual([{ key: 'row-1', direction: 'left' }])
  })

  it('does nothing for a nudge that never reaches the threshold', () => {
    // Firing on a twitch would mark habits done every time someone flicks past them.
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(COMMIT_PX - 1, 0))
    swipe.release(pointer(COMMIT_PX - 1, 0))

    expect(swipes).toEqual([])
  })

  it('says when letting go would commit, so the row can show it', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(COMMIT_PX, 0))

    expect(swipe.isArmed.value).toBe(true)
  })

  it('is not armed before the threshold', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(COMMIT_PX - 5, 0))

    expect(swipe.isArmed.value).toBe(false)
  })
})

describe('following the finger', () => {
  it('tracks the horizontal distance', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(40, 0))

    expect(swipe.offset.value).toBe(40)
  })

  it('stops following past the cap, so a row never slides off its own list', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(MAX_OFFSET_PX + 500, 0))

    expect(swipe.offset.value).toBe(MAX_OFFSET_PX)
  })

  it('ignores movement below the axis threshold, which could still be a scroll', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(AXIS_LOCK_PX - 1, 0))

    expect(swipe.offset.value).toBe(0)
  })

  it('forgets the row once the gesture ends', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(40, 0))
    swipe.release(pointer(40, 0))

    expect(swipe.activeKey.value).toBeNull()
    expect(swipe.offset.value).toBe(0)
  })
})

describe('scrolling instead of swiping', () => {
  it('abandons the gesture when the finger goes down the list', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(0, AXIS_LOCK_PX + 5))
    swipe.move(pointer(COMMIT_PX + 50, AXIS_LOCK_PX + 5))
    swipe.release(pointer(COMMIT_PX + 50, AXIS_LOCK_PX + 5))

    expect(swipes).toEqual([])
    expect(swipe.offset.value).toBe(0)
  })

  it('keeps the swipe when the finger moves mostly sideways', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(AXIS_LOCK_PX + 5, 3))
    swipe.move(pointer(COMMIT_PX + 20, 6))
    swipe.release(pointer(COMMIT_PX + 20, 6))

    expect(swipes).toHaveLength(1)
  })

  it('stays committed to the horizontal axis once decided', () => {
    // A swipe that drifts downward halfway through is still a swipe.
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(AXIS_LOCK_PX + 5, 0))
    swipe.move(pointer(COMMIT_PX + 20, 200))
    swipe.release(pointer(COMMIT_PX + 20, 200))

    expect(swipes).toHaveLength(1)
  })
})

describe('more than one pointer', () => {
  it('ignores movement from a finger that did not start the swipe', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0, 1))
    swipe.move(pointer(200, 0, 2))

    expect(swipe.offset.value).toBe(0)
  })
})

describe('cancelling', () => {
  it('fires nothing and snaps the row back', () => {
    const swipe = setup()

    swipe.press('row-1', pointer(0, 0))
    swipe.move(pointer(COMMIT_PX + 20, 0))
    swipe.cancel()
    swipe.release(pointer(COMMIT_PX + 20, 0))

    expect(swipes).toEqual([])
    expect(swipe.offset.value).toBe(0)
  })
})
