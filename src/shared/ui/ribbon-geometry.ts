/** The part of a rectangle this module needs: where it starts and how wide it is. */
export interface Span {
  readonly left: number
  readonly width: number
}

/**
 * Whether a cell is showing any part of itself inside its scroller.
 *
 * Written against rectangles rather than `offsetLeft` because `offsetLeft` is measured from
 * the nearest *positioned* ancestor, which for an unpositioned scroller is some element
 * further up the page — so subtracting `scrollLeft` from it compares two numbers with
 * different origins. Chromium happened to line them up and Firefox did not, which is the
 * worst kind of bug: correct-looking arithmetic that is only right by accident.
 *
 * Bounding rectangles are already in the same coordinate space as each other, whatever the
 * layout engine decides, so the comparison cannot drift between browsers.
 */
export function isShowing(container: Span, cell: Span): boolean {
  const left = cell.left - container.left

  return left + cell.width > 0 && left < container.width
}

/**
 * How far to scroll for a cell to sit in the middle.
 *
 * Returned as an absolute scroll position rather than a delta, so a caller can hand it
 * straight to `scrollTo` and a repeated call is idempotent instead of creeping.
 */
export function scrollToCentre(
  container: Span & { readonly scrollLeft: number },
  cell: Span,
): number {
  const offsetWithin = cell.left - container.left + container.scrollLeft

  return Math.max(offsetWithin - (container.width - cell.width) / 2, 0)
}
