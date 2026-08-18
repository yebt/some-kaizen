import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CANCEL_TOLERANCE_PX, LONG_PRESS_MS } from '../drag/use-drag-and-drop'

import { usePressHold } from './use-press-hold'

function pointer(x: number, y: number, pointerId = 1) {
  return { pointerId, clientX: x, clientY: y }
}

let held: string[]

function setup() {
  return usePressHold({ onHold: (key) => held.push(key) })
}

beforeEach(() => {
  held = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('holding', () => {
  it('fires the moment the hold completes rather than on release', () => {
    // The menu should already be open under the finger, not appear after lifting it.
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(held).toEqual(['habit-1'])
  })

  it('has not fired a moment before the threshold', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)

    expect(held).toEqual([])
  })

  it('marks which item is being pressed, so only that one reacts', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))

    expect(hold.pendingKey.value).toBe('habit-1')
  })

  it('stops looking pressed once the menu opens', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(hold.pendingKey.value).toBeNull()
  })
})

describe('a tap rather than a hold', () => {
  it('does nothing when released early', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))
    hold.release(pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(held).toEqual([])
  })
})

describe('scrolling rather than holding', () => {
  it('gives up when the finger travels, so the list stays scrollable', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))
    hold.move(pointer(10, 10 + CANCEL_TOLERANCE_PX + 1))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(held).toEqual([])
  })

  it('tolerates the small wobble of a finger holding still', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))
    hold.move(pointer(12, 13))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(held).toEqual(['habit-1'])
  })
})

describe('more than one pointer', () => {
  it('ignores movement from a finger that did not start the press', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10, 1))
    hold.move(pointer(500, 500, 2))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(held).toEqual(['habit-1'])
  })

  it('ignores a release from another finger', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10, 1))
    hold.release(pointer(10, 10, 2))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(held).toEqual(['habit-1'])
  })
})

describe('pressing something else', () => {
  it('abandons the first press rather than firing both', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))
    hold.press('habit-2', pointer(10, 60))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(held).toEqual(['habit-2'])
  })
})

describe('cancelling', () => {
  it('drops a pending hold', () => {
    const hold = setup()

    hold.press('habit-1', pointer(10, 10))
    hold.cancel()
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(held).toEqual([])
  })
})
