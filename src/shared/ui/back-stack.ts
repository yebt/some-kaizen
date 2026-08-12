/**
 * Who gets to answer the back gesture, newest first.
 *
 * On Android, back means "undo the last thing that appeared", and what appeared last is
 * almost never a route: it is a sheet, a dialog, a picker. A handler that only ever calls
 * `router.back()` closes the screen behind an open dialog and leaves the dialog floating
 * over the wrong page, which is the single most common way an app feels broken on a phone.
 *
 * A stack rather than a single handler, because dialogs nest: a confirmation opened from a
 * sheet has to close before the sheet does, and that order is exactly the order they
 * registered in.
 *
 * Deliberately a plain module rather than a store. It holds no reactive state, is read at
 * most once per gesture, and belongs to whoever is on screen rather than to any one screen.
 */
type BackHandler = () => void

const handlers: BackHandler[] = []

/**
 * Registers a handler for as long as something is open, returning the way to take it back.
 *
 * The caller keeps the release function rather than passing an identity in, so forgetting to
 * unregister is a leak in one component instead of a stale handler swallowing every back
 * gesture in the app.
 */
export function pushBackHandler(handler: BackHandler): () => void {
  handlers.push(handler)

  return () => {
    const index = handlers.lastIndexOf(handler)

    // Not necessarily the top of the stack: a dialog can be unmounted by a route change
    // while a confirmation it opened is still registered above it.
    if (index !== -1) handlers.splice(index, 1)
  }
}

/**
 * Lets whatever is on top answer the gesture.
 *
 * Returns whether anything did, so the caller can fall through to navigation instead of
 * having to guess what is open.
 */
export function handleBack(): boolean {
  const handler = handlers.at(-1)

  if (!handler) return false

  handler()

  return true
}

/** Only for tests, which share module state between cases. */
export function resetBackHandlers(): void {
  handlers.length = 0
}
