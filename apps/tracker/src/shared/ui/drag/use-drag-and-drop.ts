import { computed, ref, shallowRef } from 'vue'

/** Marks an element as a drop target. Its value is the zone key handed back on drop. */
export const DROP_ZONE_ATTRIBUTE = 'data-drop-zone'

/**
 * How long a finger must rest before the card is picked up.
 *
 * Long enough that a flick reads as a scroll rather than a drag, short enough that a
 * deliberate pick up does not feel stuck. Below roughly 150ms every scroll starts stealing
 * cards; above roughly 300ms the gesture feels broken.
 */
export const LONG_PRESS_MS = 180

/** A press that wanders further than this before the timer fires was a scroll, not a grab. */
export const CANCEL_TOLERANCE_PX = 8

/**
 * How close to an edge a dragged card starts pulling the page along with it.
 *
 * A drag claims the whole gesture, so while a card is in the air the page cannot be
 * scrolled: on a phone that means anything off screen is unreachable, and a day timeline is
 * 1440 pixels tall on a 800 pixel screen. Roughly a thumb's width, so the band is reachable
 * without being somewhere a finger lands by accident.
 */
export const EDGE_SCROLL_PX = 64

/** The fastest the page moves, in pixels per frame, reached only at the very edge. */
export const EDGE_SCROLL_SPEED = 14

/** Roughly one frame at 60Hz. The page has to keep moving while the finger holds still. */
export const EDGE_SCROLL_FRAME_MS = 16

/**
 * How far to scroll for a finger at this height, easing in across the band.
 *
 * Proportional rather than constant so the edge has a soft entry: a card nudged just inside
 * the band creeps, and one pinned against the screen edge races. A fixed speed makes the
 * band feel like a trapdoor, since the page lurches the instant the finger crosses it.
 *
 * Negative scrolls up, which is the direction of the edge the finger is near.
 */
export function edgeScrollBy(y: number, viewportHeight: number): number {
  if (viewportHeight <= 0) return 0

  const depth = (distance: number) => Math.min((EDGE_SCROLL_PX - distance) / EDGE_SCROLL_PX, 1)

  if (y < EDGE_SCROLL_PX) return -Math.ceil(depth(y) * EDGE_SCROLL_SPEED)

  const fromBottom = viewportHeight - y

  if (fromBottom < EDGE_SCROLL_PX) return Math.ceil(depth(fromBottom) * EDGE_SCROLL_SPEED)

  return 0
}

/** The subset of a pointer event this gesture needs, so a test need not fake the whole thing. */
export interface PointerLike {
  readonly pointerId: number
  readonly clientX: number
  readonly clientY: number
}

/** Where on screen the finger let go. */
export interface DropPoint {
  readonly x: number
  readonly y: number
}

export interface DragAndDropOptions<T> {
  /**
   * Called with what was dropped, the zone it landed in, and where exactly.
   *
   * The position matters because not every zone is uniform: dropping on a weekday only
   * needs the day, but dropping on a timeline needs the minute, and only the caller knows
   * how to read its own geometry.
   */
  onDrop: (payload: T, zone: string, at: DropPoint) => void | Promise<void>
  /**
   * Resolves the drop zone under a screen position.
   *
   * Injected because hit testing is the one genuinely untestable part: jsdom implements no
   * `elementFromPoint`. Passing a fake here lets every rule of the gesture be proved.
   */
  resolveZone?: (x: number, y: number) => string | null
  longPressMs?: number
  /**
   * Scrolls the page while a card is held against an edge, and stops when it is not.
   *
   * Injected for the same reason as the hit test: jsdom has no layout, so neither the
   * viewport height nor a scroll position exists to drive it. A fake here makes the rule
   * — how fast, in which direction, and when it stops — ordinary code to prove.
   */
  edgeScroll?: (byPixels: number) => void
  viewportHeight?: () => number
  /**
   * Identifies what is being carried, so a card can tell whether the press being held is
   * its own. Without it every card in the list would animate at once.
   */
  keyOf?: (payload: T) => string
}

function resolveZoneFromDocument(x: number, y: number): string | null {
  // The drag ghost must be pointer-events:none, or it would sit under the finger and be
  // hit tested instead of the zone the user is actually aiming at.
  const element = document.elementFromPoint?.(x, y)

  return element?.closest(`[${DROP_ZONE_ATTRIBUTE}]`)?.getAttribute(DROP_ZONE_ATTRIBUTE) ?? null
}

/**
 * A touch-first drag gesture.
 *
 * Built on pointer events rather than the HTML drag and drop API, which does not fire on
 * touch at all, and rather than a sortable list library, which assumes reordering within a
 * list. Here a card moves between unrelated targets: from a tray onto a weekday, or from
 * one weekday onto another.
 *
 * Draggable elements need `touch-action: none` so the browser hands us the whole gesture
 * instead of claiming it for a scroll. That is why cards are small: a finger that starts
 * on empty space still scrolls the page normally.
 */
export function useDragAndDrop<T>(options: DragAndDropOptions<T>) {
  const resolveZone = options.resolveZone ?? resolveZoneFromDocument
  const longPressMs = options.longPressMs ?? LONG_PRESS_MS
  const edgeScroll = options.edgeScroll ?? ((by: number) => globalThis.scrollBy?.(0, by))
  const viewportHeight = options.viewportHeight ?? (() => globalThis.innerHeight ?? 0)

  const payload = shallowRef<T | null>(null)
  const position = ref<{ x: number; y: number } | null>(null)
  const activeZone = ref<string | null>(null)
  const isDragging = ref(false)
  const isPending = ref(false)

  let pointerId: number | null = null
  let origin: { x: number; y: number } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let scrollTimer: ReturnType<typeof setInterval> | undefined
  let scrollStep = 0

  function stopEdgeScroll() {
    clearInterval(scrollTimer)
    scrollTimer = undefined
    scrollStep = 0
  }

  /**
   * Keeps the page moving under a finger that is holding still against an edge.
   *
   * A repeating tick rather than a nudge per pointer event, because the useful case is
   * exactly the one where the finger has stopped: it is already as far down the screen as it
   * can go, and no further events are coming.
   */
  function updateEdgeScroll(y: number) {
    scrollStep = edgeScrollBy(y, viewportHeight())

    if (scrollStep === 0) {
      stopEdgeScroll()

      return
    }

    if (scrollTimer !== undefined) return

    scrollTimer = setInterval(() => {
      edgeScroll(scrollStep)

      // The finger has not moved but the page has, so a different zone is now underneath it.
      // Without this the card lands on whatever was there when the scroll started.
      const at = position.value

      if (at) activeZone.value = resolveZone(at.x, at.y)
    }, EDGE_SCROLL_FRAME_MS)
  }

  function reset() {
    clearTimeout(timer)
    stopEdgeScroll()
    timer = undefined
    pointerId = null
    origin = null
    payload.value = null
    position.value = null
    activeZone.value = null
    isDragging.value = false
    isPending.value = false
  }

  /** Call on pointerdown. Arms the gesture; the card is not picked up until the press holds. */
  function press(next: T, event: PointerLike): void {
    reset()

    payload.value = next
    pointerId = event.pointerId
    origin = { x: event.clientX, y: event.clientY }
    position.value = { x: event.clientX, y: event.clientY }
    isPending.value = true

    timer = setTimeout(() => {
      isPending.value = false
      isDragging.value = true

      if (origin) activeZone.value = resolveZone(origin.x, origin.y)
    }, longPressMs)
  }

  function move(event: PointerLike): void {
    if (pointerId === null || event.pointerId !== pointerId) return

    if (isDragging.value) {
      position.value = { x: event.clientX, y: event.clientY }
      activeZone.value = resolveZone(event.clientX, event.clientY)
      updateEdgeScroll(event.clientY)

      return
    }

    if (!origin) return

    const travelled = Math.hypot(event.clientX - origin.x, event.clientY - origin.y)

    // Moving before the press has held means the user is scrolling, so let them.
    if (travelled > CANCEL_TOLERANCE_PX) reset()
  }

  /** Call on pointerup. Drops onto the zone under the finger, if there is one. */
  async function release(event: PointerLike): Promise<void> {
    if (pointerId === null || event.pointerId !== pointerId) return

    const dropped = payload.value
    const zone = activeZone.value
    const wasDragging = isDragging.value
    const at: DropPoint = { x: event.clientX, y: event.clientY }

    reset()

    if (wasDragging && dropped !== null && zone !== null) await options.onDrop(dropped, zone, at)
  }

  /** The key of whatever is currently pressed or dragged, or nothing when idle. */
  const pressedKey = computed(() => {
    const current = payload.value

    if (current === null || !options.keyOf) return null

    return options.keyOf(current)
  })

  return {
    payload,
    position,
    activeZone,
    pressedKey,
    isDragging: computed(() => isDragging.value),
    isPending: computed(() => isPending.value),
    press,
    move,
    release,
    cancel: reset,
  }
}
