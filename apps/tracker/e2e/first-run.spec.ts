import { expect, test } from '@playwright/test'

import { open } from './support/app'

/**
 * The first minute somebody has with the app, in a browser that has never opened it.
 *
 * Every other suite arrives at a screen with something already on it. This one is the only
 * place the genuinely empty case is exercised end to end, and it is the case every installed
 * copy begins in — the one where the app has to say something useful before it has any data
 * to say it about.
 */

test('a device that has never been used is offered a day rather than a blank form', async ({
  page,
}) => {
  await open(page, '/', { firstRun: true })

  await expect(page).toHaveURL(/\/start$/)
  await expect(page.getByRole('heading', { name: /What would you like to do/ })).toBeVisible()

  // The ideas carry their reason, which is the half that survives the third week.
  await expect(page.getByText('The one that quietly makes every other one easier.')).toBeVisible()

  await page.getByRole('button', { name: 'Add Drink water' }).click()
  await page.getByRole('button', { name: 'Add Walk' }).click()
  await page.getByRole('button', { name: 'Next', exact: true }).click()

  await expect(page.getByRole('heading', { name: /already spoken for/ })).toBeVisible()
  await page.getByRole('button', { name: 'Finish' }).click()

  // Landed on a day with something on it, rather than on "no habits yet".
  await expect(page).toHaveURL(/\/(index\.html)?(\?.*)?$/)
  await expect(page.getByText('Drink water')).toBeVisible()
  await expect(page.getByText('Walk')).toBeVisible()

  // And the day has its shape. Asserted on the blocks screen rather than on the timeline,
  // because a band that begins at 23:00 is a thousand pixels below the fold and proving it is
  // there would be a test about scrolling.
  await open(page, '/block-time')
  await expect(page.getByText('Sleep', { exact: true })).toBeVisible()
  await expect(page.getByText('Work', { exact: true })).toBeVisible()
})

test('it never opens twice, even for somebody who skipped it', async ({ page }) => {
  await open(page, '/', { firstRun: true })
  await expect(page).toHaveURL(/\/start$/)

  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/\/(index\.html)?(\?.*)?$/)

  // Skipping is an answer. Asking again on the next launch would be the app not listening.
  await open(page, '/')
  await expect(page).not.toHaveURL(/\/start$/)
  await expect(page.getByText('Nothing on today yet')).toBeVisible()
})

test('the tab bar stays out of it', async ({ page }) => {
  // A screen with its own Skip and its own Next does not want a fourth way out underneath it.
  await open(page, '/', { firstRun: true })

  await expect(page.locator('nav[aria-label="Main"]')).toHaveCount(0)
})
