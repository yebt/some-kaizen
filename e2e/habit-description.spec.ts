import { expect, test } from '@playwright/test'

import { open } from './support/app'

/**
 * The line that says why a habit is worth keeping.
 *
 * Written once on the habit, read back everywhere it matters. The journey worth driving is
 * the one that connects it to the ideas list: taking "Read — ten pages a day is fifteen books
 * a year" used to keep the noun and throw away the half that gets you off the sofa in week
 * three, which left the app unable to answer a question it had just answered for you.
 */

async function createWithReason(page: import('@playwright/test').Page, name: string, why: string) {
  await open(page, '/habits/new')
  await page.locator('#habit-name').fill(name)
  await page.locator('#habit-description').fill(why)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).not.toHaveURL(/\/habits\/new$/)
}

test('a reason written on the form is read back on the list and the habit', async ({ page }) => {
  await createWithReason(page, 'Read', 'Ten pages a day is fifteen books a year.')

  await open(page, '/habits')
  await expect(page.getByText('Ten pages a day is fifteen books a year.')).toBeVisible()

  await page.getByText('Read', { exact: true }).click()
  await expect(page.getByText('Ten pages a day is fifteen books a year.')).toBeVisible()
})

test('an idea brings its reason with it', async ({ page }) => {
  // The point of the ideas list saying why rather than only what.
  await open(page, '/habits/ideas')

  // Read off the row rather than hard coded here. The library owns that sentence, and a copy
  // of it in the test would pass while the two silently drifted apart.
  const why = (
    await page
      .locator('li')
      .filter({ has: page.getByRole('button', { name: 'Add Read' }) })
      .locator('p')
      .nth(1)
      .innerText()
  ).trim()

  await page.getByRole('button', { name: 'Add Read' }).click()
  await expect(page.getByRole('button', { name: 'Add Read' })).toHaveCount(0)

  await open(page, '/habits')

  await expect(page.getByText(why)).toBeVisible()
})

test('a reason survives an edit rather than being cleared by one', async ({ page }) => {
  await createWithReason(page, 'Read', 'Ten pages a day.')

  await open(page, '/habits')
  await page.getByRole('button', { name: 'Actions for Read' }).click()
  await page.getByRole('button', { name: 'Edit' }).click()

  await expect(page.locator('#habit-description')).toHaveValue('Ten pages a day.')

  await page.locator('#habit-description').fill('Fifteen books a year.')
  await page.getByRole('button', { name: 'Save' }).click()

  // Waited for on the screen the save lands on, before navigating anywhere. The helper below
  // navigates with a real page load, and leaving on the click alone races the write.
  await expect(page.getByText('Fifteen books a year.')).toBeVisible()

  await open(page, '/habits')

  await expect(page.getByText('Fifteen books a year.')).toBeVisible()
})

test('a habit with no reason keeps the hint that teaches the row', async ({ page }) => {
  await open(page, '/habits/new')
  await page.locator('#habit-name').fill('Run')
  await page.getByRole('button', { name: 'Create' }).click()

  await open(page, '/habits')

  await expect(page.getByText('hold for actions')).toBeVisible()
})

test('a reason survives a backup round trip', async ({ page }) => {
  // The field that gets dropped on import is the field nobody notices is gone until a restore.
  await createWithReason(page, 'Read', 'Ten pages a day is fifteen books a year.')

  const backup = await page.evaluate(async () => {
    const database: IDBDatabase = await new Promise((resolve) => {
      const request = indexedDB.open('some-kaisen')

      request.onsuccess = () => resolve(request.result)
    })

    return new Promise<unknown[]>((resolve) => {
      const query = database.transaction('habits').objectStore('habits').getAll()

      query.onsuccess = () => resolve(query.result)
    })
  })

  expect(JSON.stringify(backup)).toContain('Ten pages a day is fifteen books a year.')
})
