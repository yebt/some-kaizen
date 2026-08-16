import { expect, test } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * The harness itself, proved once.
 *
 * If this file fails, nothing else in `e2e/` means anything: it says the app boots, the
 * database opens, the router navigates and a write survives a reload. Every other e2e test
 * assumes all four and tests something narrower.
 */

test('the app boots with a working local database', async ({ page }) => {
  await open(page)

  // The storage failure path replaces the whole app with this sentence, so its absence is
  // the assertion that IndexedDB actually opened.
  await expect(page.locator('#app')).not.toContainText('local database could not be opened')
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
})

test('a habit created on one screen is read back on another', async ({ page }) => {
  await createHabit(page, 'Meditate')

  await open(page, '/habits')
  await expect(page.getByText('Meditate')).toBeVisible()
})

test('what was written survives a reload, because it is on the device', async ({ page }) => {
  await createHabit(page, 'Stretch')
  await page.reload()

  await open(page, '/habits')
  await expect(page.getByText('Stretch')).toBeVisible()
})

test('each test starts with an empty database of its own', async ({ page }) => {
  // The previous test wrote "Stretch". Seeing it here would mean the suite passes or fails
  // depending on the order it happened to run in, which is worse than failing.
  await open(page, '/habits')

  await expect(page.getByText('Stretch')).toHaveCount(0)
})

test('a routine can be created and reads back with its habits and hour', async ({ page }) => {
  await createHabit(page, 'Meditate')
  await createRoutine(page, { name: 'Morning', habits: ['Meditate'], anchorTime: '06:30' })

  await open(page, '/routines')
  await expect(page.getByText('Morning')).toBeVisible()
  await expect(page.getByText('06:30')).toBeVisible()
  await expect(page.getByText('1 habit')).toBeVisible()
})
