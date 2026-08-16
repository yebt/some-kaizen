import { expect, test, type Page } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * The floating tab bar must never sit on top of something you can press.
 *
 * A regression test for a bug that had shipped and that no unit test could see. The app shell
 * carried `safe-bottom pb-28`, and both of those write `padding-bottom` — so one was silently
 * discarded and the clearance for the floating bar was never applied. The bar covered the
 * last control of every list in the app, permanently, however far you scrolled.
 *
 * jsdom has no layout, so it reports every element at zero size and cannot tell you that two
 * things overlap. This is exactly the class of defect a real browser exists to catch.
 */

/** Whether the floating bar covers the given control once the page is scrolled to its end. */
async function coveredByTabBar(page: Page, label: string): Promise<boolean> {
  await page.evaluate(() => globalThis.scrollTo(0, document.body.scrollHeight))

  return page.evaluate((name) => {
    const control = [...document.querySelectorAll('button, a')].find(
      (node) =>
        node.getAttribute('aria-label') === name || node.textContent?.trim().startsWith(name),
    )

    const pill = document.querySelector('nav[aria-label="Main"] > div')

    if (!control || !pill) return false

    const one = control.getBoundingClientRect()
    const bar = pill.getBoundingClientRect()

    // Horizontal overlap matters too: the bar is a centred pill, not a full width strip.
    return (
      one.bottom > bar.top && one.top < bar.bottom && one.right > bar.left && one.left < bar.right
    )
  }, label)
}

test('the last routine preset can actually be pressed', async ({ page }) => {
  await open(page, '/routines/presets')

  expect(await coveredByTabBar(page, 'Add Wind down')).toBe(false)
})

test('the last habit in a long list can actually be opened', async ({ page }) => {
  // Enough rows that the list runs past the fold, which is when the bar starts to matter.
  for (const name of ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel']) {
    await createHabit(page, name)
  }

  await open(page, '/habits')

  expect(await coveredByTabBar(page, 'Hotel')).toBe(false)
})

test('the last routine in a list can actually be acted on', async ({ page }) => {
  await createHabit(page, 'Meditate')

  for (const name of ['Morning', 'Midday', 'Afternoon', 'Evening', 'Night']) {
    await createRoutine(page, { name })
  }

  await open(page, '/routines')

  expect(await coveredByTabBar(page, 'Actions for Night')).toBe(false)
})

test('the settings screen keeps its last action clear of the bar', async ({ page }) => {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'Show the destructive actions' }).click()

  expect(await coveredByTabBar(page, 'Clear everything')).toBe(false)
})
