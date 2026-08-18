import { expect, test } from '@playwright/test'

import { createHabit, open, today } from './support/app'
import {
  CANCEL_TOLERANCE_PX,
  centreOf,
  dragFrom,
  HOLD_MS,
  openTray,
  promisedTime,
  swipeFrom,
  viewportYOfMinute,
} from './support/gestures'

/**
 * The gestures that keep breaking, driven in a browser that has layout and pointer capture.
 *
 * Everything here is unprovable in jsdom, and not for want of trying. There is no
 * `elementFromPoint`, so which drop zone is under the finger has to be faked; there is no
 * pointer capture, so a move past the edge of the card keeps reporting when in a browser it
 * would stop; and there is no layout, so the arithmetic that turns a screen position into a
 * minute has nothing to read. The unit suite proves the *recogniser* — press, axis lock,
 * cancellation, edge scroll — and thirty-two tests of it have never regressed. Every failure
 * this app has actually had was the other half: geometry.
 *
 * So these tests aim at geometry. What the screen promised while the card was in the air, and
 * what was written when it landed, have to be the same number.
 */

const CHIP = '[data-drop-zone="tray"] .grippable'

test.describe('the chip has to be holdable', () => {
  test('its middle is the chip, not a button, however short the name', async ({ page }) => {
    /*
     * A regression, and one introduced by a fix.
     *
     * Adding a control to the chip so a habit could be placed without a gesture cost the
     * gesture: a touch target is at least 44px whatever size the icon in it, and on a chip
     * reading "Run" that target reached past the middle. Holding the chip — the one thing the
     * drawer exists for — pressed the button instead.
     *
     * jsdom reports every element at zero size, so it cannot tell you two targets overlap.
     */
    for (const name of ['A', 'Run', 'Meditate']) await createHabit(page, name)

    await open(page, `/day/${today()}`)
    await openTray(page)

    const hits = await page.evaluate(() =>
      [...document.querySelectorAll('[data-drop-zone="tray"] .grippable')].map((chip) => {
        const box = chip.getBoundingClientRect()
        const under = document.elementFromPoint(
          Math.round(box.left + box.width / 2),
          Math.round(box.top + box.height / 2),
        )

        return under?.tagName === 'BUTTON' ? 'button' : 'chip'
      }),
    )

    expect(hits).toHaveLength(3)
    expect(hits.every((hit) => hit === 'chip')).toBe(true)
  })
})

test.describe('carrying a habit out of the drawer', () => {
  test('lands it at the hour it was dropped on', async ({ page }) => {
    await createHabit(page, 'Meditate')
    await open(page, `/day/${today()}`)
    await openTray(page)

    const chip = await centreOf(page, CHIP)
    const y = await viewportYOfMinute(page, 8 * 60)

    await dragFrom(page, chip, { x: 180, y })

    await expect(
      page.getByRole('button', { name: 'Set the exact time of Meditate' }),
    ).toContainText('08:00')
  })

  test('writes exactly the time the gutter was promising', async ({ page }) => {
    /*
     * The bug this app kept having, in one assertion.
     *
     * Two expressions decide where a card goes: the one that draws the marker under the
     * finger, and the one that computes what to save. When they drift, the card lands
     * somewhere other than where the screen said it would — which is invisible to any test
     * that only checks the write, because the write is self-consistently wrong.
     */
    await createHabit(page, 'Meditate')
    await open(page, `/day/${today()}`)
    await openTray(page)

    const chip = await centreOf(page, CHIP)
    // Deliberately not on a quarter hour: the snap is where the two expressions can disagree.
    const y = await viewportYOfMinute(page, 9 * 60 + 37)

    await page.mouse.move(chip.x, chip.y)
    await page.mouse.down()
    await page.waitForTimeout(HOLD_MS)
    await page.mouse.move(180, y, { steps: 12 })

    const promised = await promisedTime(page)

    await page.mouse.up()

    expect(promised).not.toBeNull()
    await expect(
      page.getByRole('button', { name: 'Set the exact time of Meditate' }),
    ).toContainText(promised!)
  })

  test('takes the habit out of the drawer once it has an hour', async ({ page }) => {
    await createHabit(page, 'Meditate')
    await open(page, `/day/${today()}`)
    await openTray(page)

    const chip = await centreOf(page, CHIP)
    const y = await viewportYOfMinute(page, 8 * 60)

    await dragFrom(page, chip, { x: 180, y })

    // The drawer closes itself: it was open to hand this over and it has.
    await expect(page.locator('[data-drop-zone="tray"]')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Adjust Meditate' })).toBeVisible()
  })
})

test.describe('a press that was really a scroll', () => {
  test('does not pick the card up when the finger moves first', async ({ page }) => {
    // A flick that starts on a chip is someone scrolling the page, and stealing it is how a
    // list becomes impossible to scroll.
    await createHabit(page, 'Meditate')
    await open(page, `/day/${today()}`)
    await openTray(page)

    const chip = await centreOf(page, CHIP)
    const y = await viewportYOfMinute(page, 8 * 60)

    await page.mouse.move(chip.x, chip.y)
    await page.mouse.down()
    // Moved well past the tolerance before the hold could complete.
    await page.mouse.move(chip.x, chip.y - CANCEL_TOLERANCE_PX * 6, { steps: 4 })
    await page.mouse.move(180, y, { steps: 8 })
    await page.mouse.up()

    await expect(page.getByRole('button', { name: 'Set the exact time of Meditate' })).toHaveCount(
      0,
    )
  })
})

test.describe('moving a card already on the ruler', () => {
  test('carries it to the hour it was dropped on', async ({ page }) => {
    await createHabit(page, 'Meditate', { usualTime: '07:00' })
    await open(page, `/day/${today()}`)

    // Drawn at the habit's usual hour, so there is a card to pick up without planning one.
    await expect(
      page.getByRole('button', { name: 'Set the exact time of Meditate' }),
    ).toContainText('07:00')

    /*
     * The scroll comes first, and the card is measured after it.
     *
     * A chip lives in a drawer pinned to the screen and does not move when the page scrolls;
     * a card is on the ruler and does. Measuring it first and scrolling afterwards aims the
     * press at where the card used to be, which is a mistake in the test that reads exactly
     * like a broken gesture.
     */
    const y = await viewportYOfMinute(page, 9 * 60 + 30)
    const card = await centreOf(page, '[aria-label="Adjust Meditate"]')

    await dragFrom(page, card, { x: card.x, y })

    /*
     * 09:15, not 09:30, and that is the point of the test.
     *
     * A card is carried by the place it was grabbed, not repositioned so its top edge sits
     * under the finger. This one is half an hour long and was taken by its middle, so
     * dropping that middle on 09:30 starts it a quarter of an hour earlier. The alternative —
     * snapping the start to the finger — makes every card jump the moment it is picked up.
     */
    await expect(
      page.getByRole('button', { name: 'Set the exact time of Meditate' }),
    ).toContainText('09:15')
  })

  test('dropped on the strip below, it loses its hour rather than the day', async ({ page }) => {
    /*
     * The drawer is not the target here, and finding that out is half the value of the test.
     *
     * While the drawer is open a dim layer covers the day behind it, so a card on the ruler
     * cannot be picked up at all. The place a lifted card goes back to is a strip that only
     * exists *while* something is in the air — which means it has to be measured mid-gesture,
     * after the hold has completed and before the finger lets go.
     */
    await createHabit(page, 'Meditate', { usualTime: '07:00' })
    await open(page, `/day/${today()}`)

    await viewportYOfMinute(page, 7 * 60)

    const card = await centreOf(page, '[aria-label="Adjust Meditate"]')

    await page.mouse.move(card.x, card.y)
    await page.mouse.down()
    await page.waitForTimeout(HOLD_MS)

    const strip = await centreOf(page, `[data-drop-zone="tray"]:visible`)

    await page.mouse.move(strip.x, strip.y, { steps: 12 })
    await page.mouse.up()

    // Still owed today, just not at a fixed hour, which is what the drawer is for.
    await expect(page.getByRole('button', { name: 'Set the exact time of Meditate' })).toHaveCount(
      0,
    )
    await expect(page.getByText(/needs? an hour/)).toBeVisible()
  })
})

test.describe('what a finger is allowed to do', () => {
  /*
   * The half of the gesture a mouse cannot exercise.
   *
   * Driving a real multi-step touch turned out not to be available: `page.touchscreen` only
   * taps, and raw `Input.dispatchTouchEvent` over CDP never reached the page here — the same
   * unreliability that was recorded the last time this was attempted. What *is* reachable is
   * the contract that decides whether the browser steals the gesture in the first place, and
   * it is a real one: `touch-action` is read when the finger lands, so getting it wrong makes
   * a card either unscrollable-from or un-draggable, with no error either way.
   */
  test.use({ hasTouch: true })

  test('a chip claims the whole gesture, a card leaves the page scrollable', async ({ page }) => {
    await createHabit(page, 'Meditate', { usualTime: '07:00' })
    await createHabit(page, 'Read')
    await open(page, `/day/${today()}`)
    await openTray(page)

    const chip = page.locator(CHIP).first()
    const card = page.locator('[data-drop-zone="timeline"] .grippable').first()

    // The drawer exists for exactly one action, and a chip is one wobble away from the
    // browser deciding the gesture was a pan and cancelling the hold.
    await expect(chip).toHaveCSS('touch-action', 'none')
    // A timeline covered in cards still has to feel like a page, so a finger landing on one
    // scrolls until the hold completes.
    await expect(card).toHaveCSS('touch-action', 'pan-y')
  })

  test('a card in the air refuses the scroll it was still allowing', async ({ page }) => {
    /*
     * `touch-action` cannot do this job: it is read when the finger lands, before anyone
     * knows whether the press will become a drag. So the refusal is a non-passive `touchmove`
     * listener added only once the card is actually being carried — and it is that listener,
     * not a declaration, that this checks.
     */
    await createHabit(page, 'Meditate', { usualTime: '07:00' })
    await open(page, `/day/${today()}`)

    await viewportYOfMinute(page, 7 * 60)

    const card = await centreOf(page, '[aria-label="Adjust Meditate"]')
    const prevented = async () =>
      page
        .locator('[data-drop-zone="timeline"] .grippable')
        .first()
        .evaluate((node) => {
          const event = new TouchEvent('touchmove', { cancelable: true, bubbles: true })

          node.dispatchEvent(event)

          return event.defaultPrevented
        })

    expect(await prevented()).toBe(false)

    await page.mouse.move(card.x, card.y)
    await page.mouse.down()
    await page.waitForTimeout(HOLD_MS)

    expect(await prevented()).toBe(true)

    await page.mouse.up()

    // And it stops refusing once the card is back down, or the day becomes unscrollable.
    expect(await prevented()).toBe(false)
  })
})

test.describe('swiping a card off the ruler', () => {
  test('takes its hour away, leaving the habit still owed today', async ({ page }) => {
    /*
     * A shortcut rather than the only route — the sheet on the card and the strip below both
     * do this already — which is why it can be a gesture without costing anyone anything.
     *
     * In a browser rather than jsdom because the two gestures share one press: a swipe is
     * movement from the start and a drag needs the finger to hold still first, and only real
     * pointer capture and real hit testing decide which of them a given movement was.
     */
    await createHabit(page, 'Meditate', { usualTime: '07:00' })
    await open(page, `/day/${today()}`)

    await viewportYOfMinute(page, 7 * 60)

    const card = await centreOf(page, '[aria-label="Adjust Meditate"]')

    // No hold: straight sideways, which is what makes this a swipe and not a lift.
    await swipeFrom(page, card, -140)

    await expect(page.getByRole('button', { name: 'Set the exact time of Meditate' })).toHaveCount(
      0,
    )
    await expect(page.getByText(/needs? an hour/)).toBeVisible()
  })

  test('a nudge that never commits leaves the card exactly where it was', async ({ page }) => {
    await createHabit(page, 'Meditate', { usualTime: '07:00' })
    await open(page, `/day/${today()}`)

    await viewportYOfMinute(page, 7 * 60)

    const card = await centreOf(page, '[aria-label="Adjust Meditate"]')

    await swipeFrom(page, card, -30)

    await expect(
      page.getByRole('button', { name: 'Set the exact time of Meditate' }),
    ).toContainText('07:00')
  })
})
