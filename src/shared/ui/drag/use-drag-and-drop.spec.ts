import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { CANCEL_TOLERANCE_PX, LONG_PRESS_MS, useDragAndDrop } from './use-drag-and-drop'

function pointer(x: number, y: number, pointerId = 1) {
  return { pointerId, clientX: x, clientY: y }
}

/** Anything past x=100 is the Tuesday column; before it, Monday. */
function zoneAt(x: number): string | null {
  if (x < 0) return null

  return x > 100 ? 'tuesday' : 'monday'
}

let drops: Array<{ payload: string; zone: string }>

function setup() {
  return useDragAndDrop<string>({
    onDrop: (payload, zone) => {
      drops.push({ payload, zone })
    },
    resolveZone: (x) => zoneAt(x),
  })
}

beforeEach(() => {
  drops = []
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('picking up', () => {
  it('does not pick up immediately on press', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))

    expect(drag.isDragging.value).toBe(false)
    expect(drag.isPending.value).toBe(true)
  })

  it('picks up once the press has held', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(drag.isDragging.value).toBe(true)
    expect(drag.isPending.value).toBe(false)
  })

  it('is still only pending a moment before the threshold', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS - 1)

    expect(drag.isDragging.value).toBe(false)
  })

  it('remembers what is being dragged', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(drag.payload.value).toBe('run')
  })
})

describe('scrolling instead of dragging', () => {
  it('abandons the gesture when the finger travels before the press holds', () => {
    // A flick is how the page is scrolled. Stealing it would make the planner unscrollable.
    const drag = setup()

    drag.press('run', pointer(10, 10))
    drag.move(pointer(10, 10 + CANCEL_TOLERANCE_PX + 1))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(drag.isDragging.value).toBe(false)
    expect(drag.payload.value).toBeNull()
  })

  it('tolerates the small wobble of a finger holding still', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    drag.move(pointer(12, 13))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(drag.isDragging.value).toBe(true)
  })

  it('moves freely once the card has been picked up', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    drag.move(pointer(400, 400))

    expect(drag.isDragging.value).toBe(true)
    expect(drag.position.value).toEqual({ x: 400, y: 400 })
  })
})

describe('the zone under the finger', () => {
  it('starts on the zone the press began in', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(drag.activeZone.value).toBe('monday')
  })

  it('follows the finger across zones', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    drag.move(pointer(150, 10))

    expect(drag.activeZone.value).toBe('tuesday')
  })

  it('is nothing when the finger is over no zone', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    drag.move(pointer(-50, 10))

    expect(drag.activeZone.value).toBeNull()
  })
})

describe('dropping', () => {
  it('drops onto the zone under the finger', async () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    drag.move(pointer(150, 10))
    await drag.release(pointer(150, 10))

    expect(drops).toEqual([{ payload: 'run', zone: 'tuesday' }])
  })

  it('drops nothing when released over no zone', async () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    drag.move(pointer(-50, 10))
    await drag.release(pointer(-50, 10))

    expect(drops).toEqual([])
  })

  it('drops nothing when the press never held, so a tap is not a move', async () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    await drag.release(pointer(10, 10))

    expect(drops).toEqual([])
  })

  it('clears its state after a drop', async () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    await drag.release(pointer(10, 10))

    expect(drag.isDragging.value).toBe(false)
    expect(drag.payload.value).toBeNull()
    expect(drag.activeZone.value).toBeNull()
  })

  it('drops only once even if release is repeated', async () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    await drag.release(pointer(10, 10))
    await drag.release(pointer(10, 10))

    expect(drops).toHaveLength(1)
  })
})

describe('a second finger', () => {
  it('ignores movement from a pointer that did not start the drag', () => {
    // A second finger landing mid drag, or a stylus alongside a touch, must not steer it.
    const drag = setup()

    drag.press('run', pointer(10, 10, 1))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    drag.move(pointer(150, 10, 2))

    expect(drag.activeZone.value).toBe('monday')
  })

  it('ignores a release from another pointer', async () => {
    const drag = setup()

    drag.press('run', pointer(10, 10, 1))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    await drag.release(pointer(10, 10, 2))

    expect(drops).toEqual([])
    expect(drag.isDragging.value).toBe(true)
  })
})

describe('cancelling', () => {
  it('drops nothing when the gesture is cancelled', async () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    drag.cancel()
    await drag.release(pointer(10, 10))

    expect(drops).toEqual([])
    expect(drag.isDragging.value).toBe(false)
  })

  it('does not fire a pending pick up after cancelling', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    drag.cancel()
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(drag.isDragging.value).toBe(false)
  })
})

describe('starting a new gesture', () => {
  it('abandons a half started one rather than leaving a stray timer', () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    drag.press('meditate', pointer(150, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)

    expect(drag.payload.value).toBe('meditate')
    expect(drag.activeZone.value).toBe('tuesday')
  })
})
