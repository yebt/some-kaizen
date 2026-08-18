import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CANCEL_TOLERANCE_PX,
  EDGE_SCROLL_FRAME_MS,
  EDGE_SCROLL_PX,
  EDGE_SCROLL_SPEED,
  edgeScrollBy,
  LONG_PRESS_MS,
  useDragAndDrop,
} from './use-drag-and-drop'

function pointer(x: number, y: number, pointerId = 1) {
  return { pointerId, clientX: x, clientY: y }
}

/** Anything past x=100 is the Tuesday column; before it, Monday. */
function zoneAt(x: number): string | null {
  if (x < 0) return null

  return x > 100 ? 'tuesday' : zones
}

/** What sits under a low x, so a test can move the page rather than the finger. */
let zones = 'monday'

let drops: Array<{ payload: string; zone: string; at: { x: number; y: number } }>

function setup() {
  return useDragAndDrop<string>({
    onDrop: (payload, zone, at) => {
      drops.push({ payload, zone, at })
    },
    resolveZone: (x) => zoneAt(x),
  })
}

beforeEach(() => {
  drops = []
  zones = 'monday'
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

    expect(drops).toEqual([{ payload: 'run', zone: 'tuesday', at: { x: 150, y: 10 } }])
  })

  it('reports where the finger let go, which a timeline needs to read a minute from', async () => {
    const drag = setup()

    drag.press('run', pointer(10, 10))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    await drag.release(pointer(42, 640))

    expect(drops[0]?.at).toEqual({ x: 42, y: 640 })
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

describe('scrolling while a card is held against an edge', () => {
  const VIEWPORT = 800

  function scrolling() {
    const scrolled: number[] = []
    const drag = useDragAndDrop<string>({
      onDrop: (payload, zone, at) => {
        drops.push({ payload, zone, at })
      },
      resolveZone: (x) => zoneAt(x),
      edgeScroll: (by) => scrolled.push(by),
      viewportHeight: () => VIEWPORT,
    })

    return { drag, scrolled }
  }

  function pickUp(drag: ReturnType<typeof setup>) {
    drag.press('run', pointer(10, 400))
    vi.advanceTimersByTime(LONG_PRESS_MS)
  }

  it('leaves the page alone while the card is in the middle of the screen', () => {
    const { drag, scrolled } = scrolling()

    pickUp(drag)
    drag.move(pointer(10, 400))
    vi.advanceTimersByTime(100)

    expect(scrolled).toEqual([])
  })

  it('pulls the page down when the card is held near the bottom', () => {
    const { drag, scrolled } = scrolling()

    pickUp(drag)
    drag.move(pointer(10, VIEWPORT - 4))
    vi.advanceTimersByTime(EDGE_SCROLL_FRAME_MS)

    expect(scrolled.at(0)).toBeGreaterThan(0)
  })

  it('pulls it up when the card is held near the top', () => {
    const { drag, scrolled } = scrolling()

    pickUp(drag)
    drag.move(pointer(10, 4))
    vi.advanceTimersByTime(EDGE_SCROLL_FRAME_MS)

    expect(scrolled.at(0)).toBeLessThan(0)
  })

  it('keeps going while the finger holds perfectly still', () => {
    // The whole point: at the edge of the screen there is nowhere further to move, so no
    // more pointer events are coming and a nudge per event would scroll exactly once.
    const { drag, scrolled } = scrolling()

    pickUp(drag)
    drag.move(pointer(10, VIEWPORT - 4))
    vi.advanceTimersByTime(EDGE_SCROLL_FRAME_MS * 5)

    expect(scrolled.length).toBeGreaterThanOrEqual(5)
  })

  it('stops the moment the card is moved back out of the band', () => {
    const { drag, scrolled } = scrolling()

    pickUp(drag)
    drag.move(pointer(10, VIEWPORT - 4))
    vi.advanceTimersByTime(EDGE_SCROLL_FRAME_MS * 3)

    const settled = scrolled.length

    drag.move(pointer(10, 400))
    vi.advanceTimersByTime(EDGE_SCROLL_FRAME_MS * 5)

    expect(scrolled).toHaveLength(settled)
  })

  it('stops when the card is dropped, rather than scrolling forever', () => {
    const { drag, scrolled } = scrolling()

    pickUp(drag)
    drag.move(pointer(10, VIEWPORT - 4))
    vi.advanceTimersByTime(EDGE_SCROLL_FRAME_MS)
    void drag.release(pointer(10, VIEWPORT - 4))

    const settled = scrolled.length

    vi.advanceTimersByTime(EDGE_SCROLL_FRAME_MS * 5)

    expect(scrolled).toHaveLength(settled)
  })

  it('re-reads the zone under the still finger, since the page moved and it did not', () => {
    const { drag } = scrolling()

    pickUp(drag)
    drag.move(pointer(10, VIEWPORT - 4))
    expect(drag.activeZone.value).toBe('monday')

    // Whatever is under the finger changes as the page scrolls beneath it.
    zones = 'tuesday'
    vi.advanceTimersByTime(EDGE_SCROLL_FRAME_MS)

    expect(drag.activeZone.value).toBe('tuesday')
  })
})

describe('how hard the edge pulls', () => {
  it('does nothing away from either edge', () => {
    expect(edgeScrollBy(400, 800)).toBe(0)
  })

  it('eases in rather than lurching, so the band is not a trapdoor', () => {
    const justInside = edgeScrollBy(800 - EDGE_SCROLL_PX + 2, 800)
    const atTheEdge = edgeScrollBy(799, 800)

    expect(justInside).toBeGreaterThan(0)
    expect(atTheEdge).toBeGreaterThan(justInside)
  })

  it('never exceeds its top speed, even for a finger dragged off the screen', () => {
    expect(edgeScrollBy(-500, 800)).toBe(-EDGE_SCROLL_SPEED)
  })

  it('does nothing at all before the viewport has a height', () => {
    // Server rendered or measured too early: no height means no honest answer.
    expect(edgeScrollBy(10, 0)).toBe(0)
  })
})
