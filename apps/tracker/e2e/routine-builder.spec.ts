import { expect, test, type Page } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * Filling a day from a routine, driven the way a person drives it.
 *
 * The unit tests already prove the cascade arithmetic and that the right records are written.
 * What only a real browser proves is that the path exists at all: that the action is reachable
 * from the routine list, that a number typed into a step actually moves the times after it,
 * and that the day you land on shows what you just built.
 */

/** Opens the builder for a routine the way the app offers it, through the list. */
async function openBuilder(page: Page, routine: string): Promise<void> {
  await open(page, '/routines')
  await page.getByRole('button', { name: `Actions for ${routine}` }).click()
  await page.getByRole('button', { name: 'Build into a day' }).click()
  await expect(page.getByRole('heading', { name: `Build ${routine}` })).toBeVisible()
}

async function setUpMorning(page: Page): Promise<void> {
  await createHabit(page, 'Stretch', { usualDurationMinutes: 10 })
  await createHabit(page, 'Read', { usualDurationMinutes: 20 })
  await createRoutine(page, { name: 'Morning', habits: ['Stretch', 'Read'], anchorTime: '06:00' })
}

test('a routine is built into a day and shows up on it', async ({ page }) => {
  await setUpMorning(page)
  await openBuilder(page, 'Morning')

  // Seeded from the routine's own hour rather than asked for again.
  await expect(page.getByLabel('The time this routine starts')).toHaveValue('06:00')

  await page.getByRole('button', { name: 'Build the day' }).click()

  // The builder lands on the day it just filled, which is the only way to see it worked.
  await expect(page).toHaveURL(/\/day\/\d{4}-\d{2}-\d{2}$/)
  await expect(page.getByText('Stretch').first()).toBeVisible()
  await expect(page.getByText('Read').first()).toBeVisible()
})

test('a longer step pushes the ones after it, before anything is committed', async ({ page }) => {
  await setUpMorning(page)
  await openBuilder(page, 'Morning')

  await expect(page.getByText('06:10')).toBeVisible()

  await page.getByLabel('How long Stretch takes, in minutes').fill('25')

  await expect(page.getByText('06:25')).toBeVisible()
  await expect(page.getByText('06:10')).toHaveCount(0)
})

test('the lengths are remembered, so the next build opens already filled in', async ({ page }) => {
  await setUpMorning(page)
  await openBuilder(page, 'Morning')

  await page.getByLabel('How long Stretch takes, in minutes').fill('25')
  await page.getByRole('button', { name: 'Build the day' }).click()
  await expect(page).toHaveURL(/\/day\//)

  await openBuilder(page, 'Morning')

  await expect(page.getByLabel('How long Stretch takes, in minutes')).toHaveValue('25')
})

test('building twice leaves one card, not two', async ({ page }) => {
  await setUpMorning(page)

  for (const start of ['06:00', '07:00']) {
    await openBuilder(page, 'Morning')
    await page.getByLabel('The time this routine starts').fill(start)
    await page.getByRole('button', { name: 'Build the day' }).click()
    await expect(page).toHaveURL(/\/day\//)
  }

  // One card at the new time, and none left behind at the old one.
  await expect(page.getByText('07:00').first()).toBeVisible()
  await expect(page.getByText('Stretch')).toHaveCount(1)
})

test('any whole number of minutes can actually be saved', async ({ page }) => {
  /*
   * A regression, and one only a browser can hold.
   *
   * The length field first carried `step="5"` beside `min="1"`, which makes the browser's own
   * validity rule "1, 6, 11, 16…". Ten minutes was therefore invalid, and an invalid field
   * does not report anything — it refuses to submit the form, so the Create button simply did
   * nothing. jsdom cannot catch this: `trigger('submit')` dispatches the event directly and
   * never consults validity, so every unit test passed through it.
   */
  await createHabit(page, 'Stretch', { usualDurationMinutes: 10 })

  await open(page, '/habits')

  await expect(page.getByText('Stretch')).toBeVisible()
})

test('a routine that runs past midnight says so instead of placing steps wrongly', async ({
  page,
}) => {
  await createHabit(page, 'Wind down', { usualDurationMinutes: 20 })
  await createHabit(page, 'Sleep', { usualDurationMinutes: 20 })
  await createRoutine(page, {
    name: 'Night',
    habits: ['Wind down', 'Sleep'],
    anchorTime: '23:50',
  })

  await openBuilder(page, 'Night')

  const warning = page.getByRole('alert')

  await expect(warning).toContainText('past midnight')
  await expect(warning).toContainText('Sleep')
})
