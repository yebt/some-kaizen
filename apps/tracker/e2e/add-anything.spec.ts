import { expect, test } from '@playwright/test'

import { centreOf, HOLD_MS } from './support/gestures'
import { open } from './support/app'

/**
 * The plus in the bar, which used to add exactly one thing.
 *
 * Reported from the blocks screen: the big button at the bottom of every screen obviously
 * adds a block while you are standing on a list of blocks, and it opened a habit form. The
 * tap keeps its old meaning — that one is common enough to deserve the shortest route — and
 * the hold offers the rest, which is the only thing that makes the icon's promise true.
 *
 * Driven in a browser because the two gestures share one press, and the failure worth
 * catching is the tap firing as well and putting a form behind the sheet. jsdom will run
 * both handlers happily whatever the ordering really is.
 */

async function holdThePlus(page: import('@playwright/test').Page) {
  const plus = await centreOf(page, '[aria-label="Add habit"]')

  await page.mouse.move(plus.x, plus.y)
  await page.mouse.down()
  await page.waitForTimeout(HOLD_MS)
  await page.mouse.up()
}

test('tapping it still adds a habit', async ({ page }) => {
  await open(page, '/')

  await page.getByRole('button', { name: 'Add habit' }).click()

  await expect(page).toHaveURL(/\/habits\/new$/)
})

test('holding it offers everything the app can be given', async ({ page }) => {
  await open(page, '/')

  await holdThePlus(page)

  const sheet = page.getByRole('dialog')

  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('Routine')).toBeVisible()
  await expect(sheet.getByText('Block of time')).toBeVisible()
  await expect(sheet.getByText('Challenge')).toBeVisible()
})

test('the hold does not also open the habit form behind the sheet', async ({ page }) => {
  await open(page, '/')

  await holdThePlus(page)

  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page).not.toHaveURL(/\/habits\/new$/)
})

test('a block can be added from the bar, which is the whole complaint', async ({ page }) => {
  await open(page, '/block-time')

  await holdThePlus(page)
  await page.getByRole('dialog').getByText('Block of time').click()

  await expect(page).toHaveURL(/\/block-time\/new$/)
})
