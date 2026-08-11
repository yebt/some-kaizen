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

  const payload = shallowRef<T | null>(null)
  const position = ref<{ x: number; y: number } | null>(null)
  const activeZone = ref<string | null>(null)
  const isDragging = ref(false)
  const isPending = ref(false)

  let pointerId: number | null = null
  let origin: { x: number; y: number } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  function reset() {
    clearTimeout(timer)
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

  return {
    payload,
    position,
    activeZone,
    isDragging: computed(() => isDragging.value),
    isPending: computed(() => isPending.value),
    press,
    move,
    release,
    cancel: reset,
  }
}
