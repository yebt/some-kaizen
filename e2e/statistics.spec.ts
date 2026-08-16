import { expect, test } from '@playwright/test'

import { createHabit, open, recordAmount } from './support/app'

/**
 * The statistics screen, driven the way a person drives it.
 *
 * The arithmetic — which days count, how far each window reaches, when a best day may be
 * named — is proved by unit tests over the domain. What a browser adds is that the window
 * control is really wired to the figures rather than decorative, that the week reads as seven
 * labelled bars, and that a habit's own page carries the same story.
 */

test('an empty app says so rather than showing a wall of zeroes', async ({ page }) => {
  await open(page, '/stats')

  await expect(page.getByText('Nothing to measure yet')).toBeVisible()
})

test('the window control is offered, and starts somewhere that can have moved', async ({
  page,
}) => {
  await createHabit(page, 'Meditate')

  await open(page, '/stats')

  await expect(page.getByRole('tab')).toHaveCount(5)
  // A year barely shifts, so opening on one would make the screen look the same every time.
  await expect(page.getByRole('tab', { name: '30d' })).toHaveAttribute('aria-selected', 'true')
})

test('the window is wired to the figures, not decorative', async ({ page }) => {
  await createHabit(page, 'Water', { measuredIn: 'litres' })
  await recordAmount(page, 'Water', 2)

  await open(page, '/stats')

  const daysRecorded = page.getByLabel('Overall').getByText('days recorded').locator('..')

  // Today falls inside every window, so a day answered today is counted at both ends. A
  // window that changed the count here would be measuring something other than what it says.
  await page.getByRole('tab', { name: '7d' }).click()
  await expect(daysRecorded).toContainText('1')

  await page.getByRole('tab', { name: 'All' }).click()
  await expect(daysRecorded).toContainText('1')
})

test('the week reads as seven labelled bars, and refuses to name a best day too early', async ({
  page,
}) => {
  await createHabit(page, 'Water', { measuredIn: 'litres' })
  await recordAmount(page, 'Water', 2)

  await open(page, '/stats')

  await expect(page.getByLabel('Rate by day of the week').getByRole('img')).toHaveCount(7)
  // One answered day is not a pattern.
  await expect(page.getByText('Not enough answered days')).toBeVisible()
  await expect(page.getByText('Best day')).toHaveCount(0)
})

test("a habit's own page states what it is, not only how it is going", async ({ page }) => {
  await createHabit(page, 'Meditate', { usualDurationMinutes: 20 })

  await open(page, '/habits')
  await page.getByText('Meditate').first().click()

  await expect(page.getByRole('heading', { name: 'What this is' })).toBeVisible()
  await expect(page.getByText('Tracking since')).toBeVisible()
  await expect(page.getByText('20 min')).toBeVisible()

  // And the same weekly story as the overview, for this habit alone.
  await expect(page.getByLabel('Rate by day of the week').getByRole('img')).toHaveCount(7)
})

test('a recorded day shows up on the habit it belongs to', async ({ page }) => {
  await createHabit(page, 'Water', { measuredIn: 'litres' })
  await recordAmount(page, 'Water', 2)

  await open(page, '/habits')
  await page.getByText('Water').first().click()

  await expect(page.getByText('Days answered').locator('..')).toContainText('1')
})
