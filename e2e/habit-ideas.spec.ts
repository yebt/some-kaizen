import { expect, test } from '@playwright/test'

import { createHabit, open } from './support/app'

/**
 * Starting from an idea, driven the way a person drives it.
 *
 * The library is guarded as data and the conversion is proved by unit tests. What a browser
 * adds is the wiring: that the screen is reachable from where someone with nothing would
 * look, that what lands is an ordinary habit the rest of the app already understands, and —
 * the one that would have been easy to get wrong and invisible otherwise — that
 * `/habits/ideas` resolves to the library rather than being swallowed by `/habits/:id`.
 */

test('the empty habits screen offers it, which is where it is actually wanted', async ({
  page,
}) => {
  await open(page, '/habits')

  await page.getByRole('link', { name: 'Not sure? Start from an idea' }).click()

  await expect(page.getByRole('heading', { name: 'Ideas' })).toBeVisible()
})

test('it stays reachable once there are habits, without shouting about it', async ({ page }) => {
  await createHabit(page, 'Meditate')

  await open(page, '/habits')
  await page.getByRole('link', { name: 'Ideas' }).click()

  await expect(page.getByRole('heading', { name: 'Ideas' })).toBeVisible()
})

test('the address resolves to the library, not to a habit called "ideas"', async ({ page }) => {
  // `/habits/[id]` sits right beside this. A static segment has to win, or the screen is
  // unreachable by address and every link into it lands on a habit that does not exist.
  await open(page, '/habits/ideas')

  await expect(page.getByRole('heading', { name: 'Ideas' })).toBeVisible()
})

test('taking one lands an ordinary habit the rest of the app understands', async ({ page }) => {
  await open(page, '/habits/ideas')
  await page.getByRole('button', { name: 'Add Read' }).click()

  // Marked on the row at once, rather than only after a reload.
  await expect(page.getByRole('button', { name: 'Add Read' })).toHaveCount(0)

  await open(page, '/habits')
  await expect(page.getByText('Read', { exact: true })).toBeVisible()

  // And it is on Today, which is the whole reason for adding one.
  await open(page, '/')
  await expect(page.getByRole('button', { name: 'Mark Read' })).toBeVisible()
})

test('several can be taken without leaving the screen', async ({ page }) => {
  await open(page, '/habits/ideas')

  for (const name of ['Read', 'Walk', 'Stretch']) {
    await page.getByRole('button', { name: `Add ${name}` }).click()
    await expect(page.getByRole('button', { name: `Add ${name}` })).toHaveCount(0)
  }

  await expect(page).toHaveURL(/\/habits\/ideas$/)

  await open(page, '/habits')

  for (const name of ['Read', 'Walk', 'Stretch']) {
    await expect(page.getByText(name, { exact: true })).toBeVisible()
  }
})

test('an idea already tracked is marked rather than offered twice', async ({ page }) => {
  await createHabit(page, 'Read')

  await open(page, '/habits/ideas')

  await expect(page.getByRole('button', { name: 'Add Read' })).toHaveCount(0)
  await expect(page.getByText('Tracked').first()).toBeVisible()
  // The rest are still on offer.
  await expect(page.getByRole('button', { name: 'Add Walk' })).toBeVisible()
})

test('a heading narrows the list to one kind of idea', async ({ page }) => {
  await open(page, '/habits/ideas')

  await page.getByRole('tab', { name: 'Quitting' }).click()

  await expect(page.getByText('Smoking')).toBeVisible()
  await expect(page.getByText('Drink water')).toHaveCount(0)
})

test('a measured idea arrives with a dialog to record an amount in', async ({ page }) => {
  // The shapes the app models have to be discoverable from here, or the list quietly says it
  // only does one of them.
  await open(page, '/habits/ideas')
  await page.getByRole('button', { name: 'Add Drink water' }).click()
  await expect(page.getByRole('button', { name: 'Add Drink water' })).toHaveCount(0)

  await open(page, '/')

  await expect(page.getByRole('button', { name: 'Log Drink water' })).toBeVisible()
})
