import { expect, test } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * A routine handed to somebody else, and opened again on the other side.
 *
 * Driven as a round trip in a real browser because the two halves are the point: what goes
 * out has to be exactly what the other side can read, and the file leaves through a download
 * and returns through a file picker — two browser mechanisms that jsdom does not have.
 *
 * The trust model is what is absent from the file. A shared routine is a recipe rather than a
 * record: names, lengths and an hour, with no identifiers and no dates, so there is nothing
 * in it that could name, replace or revive anything on the device it lands on. It arrives as
 * a preset and goes through the same import a bundled one does, matching habits by name.
 */
test('a routine written out is a routine that can be opened again', async ({ page }) => {
  await createHabit(page, 'Stretch', { usualDurationMinutes: 10 })
  await createHabit(page, 'Read', { usualDurationMinutes: 20 })
  await createRoutine(page, { name: 'Morning', habits: ['Stretch', 'Read'] })

  await open(page, '/routines')
  await page.getByRole('button', { name: 'Actions for Morning' }).click()

  const downloading = page.waitForEvent('download')

  await page.getByRole('button', { name: 'Share' }).click()

  const download = await downloading

  expect(download.suggestedFilename()).toBe('some-kaisen-routine-morning.json')

  const path = await download.path()

  // Opened on the same device, which is the harshest version of the test: if anything in the
  // file could address what is already here, this is where it would show.
  await open(page, '/routines/presets')

  const choosing = page.waitForEvent('filechooser')

  await page.getByRole('button', { name: 'Open a shared routine' }).click()
  await (await choosing).setFiles(path)

  const offered = page.locator('li', { hasText: 'From a file' }).first()

  await expect(offered).toContainText('Morning')
  await expect(offered).toContainText('Stretch')
  await expect(offered).toContainText('Read')
  // Both habits are already here, so the honest offer is that it reuses them.
  await expect(offered).toContainText('Uses 2 habits you already track')
})
