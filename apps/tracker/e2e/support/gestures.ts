import { expect, type Page } from '@playwright/test'

/**
 * Driving the drag gesture the way a hand does, in a browser that has real layout.
 *
 * The gesture is built on pointer events, so what matters is not which input device produced
 * them but that they are *real*: a browser only grants `setPointerCapture` for a pointer it
 * knows about, and only a real hit test can say which drop zone is under a finger. jsdom has
 * neither, which is why every rule below is unprovable there — an event dispatched at a
 * detached node still runs its listeners, so the test passes whatever the code does.
 */

/** Matches `LONG_PRESS_MS`, with room for a slow frame. Held still: movement cancels it. */
export const HOLD_MS = 260

/** Matches `CANCEL_TOLERANCE_PX`. Beyond this before the hold completes, it was a scroll. */
export const CANCEL_TOLERANCE_PX = 8

/** The default timeline scale: one minute is one pixel, snapping to a quarter hour. */
export const SNAP_MINUTES = 15

/** Opens the drawer of habits that still need an hour. */
export async function openTray(page: Page): Promise<void> {
  await page.getByRole('button', { name: /needs? an hour/ }).click()
  await expect(page.locator('[data-drop-zone="tray"]')).toBeVisible()
}

/**
 * Scrolls the given minute of the day into view and reports where it now sits on screen.
 *
 * The ruler is 1440 pixels tall on an 844 pixel viewport, so any hour worth aiming at has to
 * be brought into the viewport first. Returning the position measured *after* the scroll
 * rather than predicting it is what keeps the aim honest when the page clamps at either end.
 */
export async function viewportYOfMinute(page: Page, minutes: number): Promise<number> {
  return page.evaluate((minute) => {
    const timeline = document.querySelector('[data-drop-zone="timeline"]')

    if (!timeline) throw new Error('No timeline on this page.')

    // Aimed at the upper third, clear of the drawer pinned to the bottom of the screen.
    const wanted = 260
    const before = timeline.getBoundingClientRect()

    globalThis.scrollBy(0, before.top + minute - wanted)

    return (
      document.querySelector('[data-drop-zone="timeline"]')!.getBoundingClientRect().top + minute
    )
  }, minutes)
}

export interface Grip {
  readonly x: number
  readonly y: number
}

/** Where the centre of an element is, in viewport coordinates. */
export async function centreOf(page: Page, selector: string): Promise<Grip> {
  const box = await page.locator(selector).first().boundingBox()

  if (!box) throw new Error(`${selector} has no box, so nothing can be aimed at it.`)

  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/**
 * Presses, holds still until the card lifts, carries it, and lets go.
 *
 * The pause is the whole gesture. Moving during it is read as a scroll and the card is put
 * back down, which is the behaviour the second test below relies on.
 */
export async function dragFrom(page: Page, from: Grip, to: Grip): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS)
  // In steps, because a single jump reports one move and a real hand reports many — and the
  // guide line, the ghost and the drop zone are all recomputed per move.
  await page.mouse.move(to.x, to.y, { steps: 12 })
  await page.mouse.up()
}

/** The time the gutter marker is promising while a card is in the air. */
export async function promisedTime(page: Page): Promise<string | null> {
  const marker = page.locator('[data-live-time]')

  return (await marker.count()) === 0 ? null : (await marker.innerText()).trim()
}

/**
 * Swipes horizontally from a point, without ever letting the press become a hold.
 *
 * The first move goes out immediately and deliberately. A drag begins with the finger held
 * still, so the gesture that decides between the two is really "did anything move before the
 * hold completed" — and a scripted `down` followed by a pause under load can lose that race
 * in a way a hand never does. One small move first kills the hold, and the rest is the swipe.
 */
export async function swipeFrom(page: Page, from: Grip, dx: number): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + Math.sign(dx) * 12, from.y)
  await page.mouse.move(from.x + dx, from.y, { steps: 10 })
  await page.mouse.up()
}
