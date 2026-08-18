import { expect, test, type Page } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * Filling a day from another day, or from a routine, driven the way a person drives it.
 *
 * Which day is chosen and which habits may not be carried are proved by unit tests. What a
 * browser adds is what those cannot see: that the way in is on the day screen, that the
 * preview is a real dialog whose numbers follow the field, and that the cards are on the
 * timeline afterwards.
 */

/**
 * Two days a week apart, both in the future.
 *
 * Relative to today rather than fixed, for two reasons. A habit is not active before the day
 * it was created, so a fixed pair of past dates would have everything correctly dropped and
 * the test would prove the opposite of what it claims. And being a week apart makes them the
 * same weekday by construction, which is the rule being exercised.
 */
function daysFromToday(amount: number): string {
  const date = new Date()

  date.setDate(date.getDate() + amount)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

const SOURCE = daysFromToday(1)
const TARGET = daysFromToday(8)

/** Arranges a day the only way the app can without a drag: by building a routine into it. */
async function arrange(page: Page, date: string): Promise<void> {
  await open(page, '/routines')
  await page.getByRole('button', { name: 'Actions for Morning' }).click()
  await page.getByRole('button', { name: 'Build into a day' }).click()
  await page.getByLabel('The day to build into').fill(date)
  await page.getByLabel('The time this routine starts').fill('07:00')
  await page.getByRole('button', { name: 'Build the day' }).click()
  await expect(page).toHaveURL(new RegExp(`/day/${date}$`))
}

async function setUp(page: Page): Promise<void> {
  await createHabit(page, 'Meditate', { usualDurationMinutes: 20 })
  await createRoutine(page, { name: 'Morning', habits: ['Meditate'], anchorTime: '07:00' })
  await arrange(page, SOURCE)
}

test('the day says when another day is worth copying, and stops once it is not', async ({
  page,
}) => {
  await setUp(page)

  await open(page, `/day/${TARGET}`)
  await expect(page.getByText('was arranged')).toBeVisible()

  await page.getByRole('button', { name: 'Bring a plan' }).click()
  await page.getByRole('button', { name: 'Bring it', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Adjust Meditate' })).toBeVisible()

  await open(page, `/day/${TARGET}`)

  await expect(page.getByText('was arranged')).toHaveCount(0)
})

test('the preview opens on the suggested day and names what would arrive', async ({ page }) => {
  await setUp(page)

  await open(page, `/day/${TARGET}`)
  await page.getByRole('button', { name: 'Bring a plan' }).click()

  await expect(page.getByLabel('The day to bring a plan from')).toHaveValue(SOURCE)
  await expect(page.getByText('1 habit arrives')).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Bring a plan from another day' })).toContainText(
    'Meditate',
  )
})

test('the preview follows the field, so a different day can be named', async ({ page }) => {
  await setUp(page)

  await open(page, `/day/${TARGET}`)
  await page.getByRole('button', { name: 'Bring a plan' }).click()

  // A day nothing was ever put on holds nothing to bring, and the dialog says so rather than
  // offering a button that would do nothing.
  await page.getByLabel('The day to bring a plan from').fill(daysFromToday(3))

  await expect(page.getByText('Nothing on that day can come here')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Bring it', exact: true })).toBeDisabled()
})

test('cancelling the preview leaves the day exactly as it was', async ({ page }) => {
  await setUp(page)

  await open(page, `/day/${TARGET}`)
  await page.getByRole('button', { name: 'Bring a plan' }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Adjust Meditate' })).toHaveCount(0)
  // Still on offer, because the answer was no and nothing happened.
  await expect(page.getByText('was arranged')).toBeVisible()
})

test('a routine can be built into the day being looked at, without retyping it', async ({
  page,
}) => {
  await createHabit(page, 'Meditate', { usualDurationMinutes: 20 })
  await createRoutine(page, { name: 'Morning', habits: ['Meditate'], anchorTime: '07:00' })

  await open(page, `/day/${TARGET}`)
  await page.getByRole('button', { name: 'Build a routine' }).click()
  await page.getByRole('button', { name: /^Morning/ }).click()

  // The day travelled with the link, which is the entire reason for a way in from here.
  await expect(page.getByLabel('The day to build into')).toHaveValue(TARGET)

  await page.getByRole('button', { name: 'Build the day' }).click()

  await expect(page).toHaveURL(new RegExp(`/day/${TARGET}$`))
  await expect(page.getByRole('button', { name: 'Adjust Meditate' })).toBeVisible()
})

test('no routine with steps means no offer to build one', async ({ page }) => {
  await createHabit(page, 'Meditate')

  await open(page, `/day/${TARGET}`)

  await expect(page.getByRole('button', { name: 'Build a routine' })).toHaveCount(0)
})
