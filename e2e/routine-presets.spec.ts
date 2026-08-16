import { expect, test, type Page } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * Starting from a worked example, driven the way a person drives it.
 *
 * The merge rules are proved by unit tests. What a browser adds here is the wiring: that the
 * screen is reachable from where someone would look for it, that the confirmation is a real
 * dialog a person can answer, and — the one that would have been very easy to get wrong —
 * that `/routines/presets` resolves to the library rather than being swallowed by the
 * `/routines/:id` route sitting right beside it.
 */

/** Answers the app's own confirmation dialog, which is not a native one. */
async function confirmWith(page: Page, label: string): Promise<void> {
  await page.getByRole('button', { name: label, exact: true }).click()
}

test('the library is reachable from the routines screen', async ({ page }) => {
  await open(page, '/routines')
  await page.getByRole('link', { name: 'Examples' }).click()

  await expect(page.getByRole('heading', { name: 'Start from a routine' })).toBeVisible()
})

test('the empty routines screen offers it, which is where it is actually wanted', async ({
  page,
}) => {
  await open(page, '/routines')

  await page.getByRole('link', { name: 'Start from a worked example' }).click()

  await expect(page.getByRole('heading', { name: 'Start from a routine' })).toBeVisible()
})

test('the address resolves to the library, not to a routine called "presets"', async ({ page }) => {
  // `/routines/[id]` sits right beside this. A static segment has to win, or the library is
  // unreachable by address and every link into it lands on "that routine no longer exists".
  await open(page, '/routines/presets')

  await expect(page.getByRole('heading', { name: 'Start from a routine' })).toBeVisible()
})

test('adding one creates its habits and the routine holding them', async ({ page }) => {
  await open(page, '/routines/presets')
  await page.getByRole('button', { name: 'Add The calm 15' }).click()
  await confirmWith(page, 'Add it')

  await expect(page).toHaveURL(/\/routines$/)
  // Exact, because the success toast reads "The calm 15 added" and would match a loose one —
  // which would have this pass on the toast alone even if the list never showed the routine.
  await expect(page.getByText('The calm 15', { exact: true })).toBeVisible()
  await expect(page.getByText('3 habits')).toBeVisible()

  await open(page, '/habits')

  for (const step of ['Breathe', 'Stretch', 'Plan the day']) {
    await expect(page.getByText(step).first()).toBeVisible()
  }
})

test('a habit already tracked is taken in, not duplicated', async ({ page }) => {
  await createHabit(page, 'Stretch')

  await open(page, '/routines/presets')

  // Said before the tap, which is what makes the merge believable rather than magic.
  await expect(page.getByText('Uses 1 habit you already track')).toBeVisible()

  await page.getByRole('button', { name: 'Add The calm 15' }).click()
  await confirmWith(page, 'Add it')

  await open(page, '/habits')

  await expect(page.getByText('Stretch')).toHaveCount(1)
})

test('a reused habit leaves the routine that had it, so it is never in two', async ({ page }) => {
  await createHabit(page, 'Stretch')
  await createRoutine(page, { name: 'Evening', habits: ['Stretch'] })

  await open(page, '/routines/presets')
  await page.getByRole('button', { name: 'Add The calm 15' }).click()
  await confirmWith(page, 'Add it')

  await expect(page.getByText('The calm 15', { exact: true })).toBeVisible()
  // Evening kept its name and lost its only habit, rather than holding a habit twice.
  await expect(page.getByText('0 habits')).toBeVisible()
})

test('answering no leaves the app exactly as it was', async ({ page }) => {
  await open(page, '/routines/presets')
  await page.getByRole('button', { name: 'Add The calm 15' }).click()
  await confirmWith(page, 'Cancel')

  await open(page, '/habits')

  await expect(page.getByText('Breathe')).toHaveCount(0)
})

test('what lands is ordinary, and can be built straight away', async ({ page }) => {
  // The point of stating lengths in the preset: the routine it creates is immediately usable
  // by the builder, with nothing left to fill in.
  await open(page, '/routines/presets')
  await page.getByRole('button', { name: 'Add The calm 15' }).click()
  await confirmWith(page, 'Add it')

  await page.getByRole('button', { name: 'Actions for The calm 15' }).click()
  await page.getByRole('button', { name: 'Build into a day' }).click()

  await expect(page.getByLabel('How long Breathe takes, in minutes')).toHaveValue('5')
  await expect(page.getByLabel('The time this routine starts')).toHaveValue('07:00')
})
