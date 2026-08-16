import { expect, test, type Page } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * Bringing a day already arranged onto one that is not, driven the way a person drives it.
 *
 * Which day is chosen, and which habits may not be carried, are proved by unit tests. What a
 * browser adds is what those cannot see: that the offer appears on the day it applies to and
 * nowhere else, that the preview is a dialog a person can actually decline, and that the
 * cards are on the timeline afterwards.
 */

/**
 * Two days a week apart, both in the future.
 *
 * Relative to today rather than fixed, for two reasons. A habit is not active before the day
 * it was created, so a fixed pair of dates in the past would have everything correctly
 * dropped and the test would prove the opposite of what it claims. And being a week apart
 * makes them the same weekday by construction, which is the rule being exercised.
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

/**
 * Arranges a day the only way the app can do it without a drag: by building a routine into it.
 *
 * Reaching into storage would be quicker and would stop testing the thing this file is for.
 */
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

test('no offer appears on a day with nothing behind it', async ({ page }) => {
  await createHabit(page, 'Meditate')

  await open(page, `/day/${TARGET}`)

  await expect(page.getByText('was arranged')).toHaveCount(0)
})

test('the same weekday last week is offered, and brought over on request', async ({ page }) => {
  await setUp(page)

  await open(page, `/day/${TARGET}`)
  await expect(page.getByText('was arranged')).toBeVisible()

  await page.getByRole('button', { name: 'Bring it', exact: true }).click()
  // The second is the confirmation's, raised over the page by the feedback host.
  await page.getByRole('button', { name: 'Bring it', exact: true }).last().click()

  // On this day's timeline now, at the hour it had on the other one.
  await expect(page.getByRole('button', { name: 'Adjust Meditate' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Set the exact time of Meditate' })).toContainText(
    '07:00',
  )
})

test('declining the preview leaves the day exactly as it was', async ({ page }) => {
  await setUp(page)

  await open(page, `/day/${TARGET}`)
  await page.getByRole('button', { name: 'Bring it', exact: true }).click()
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Adjust Meditate' })).toHaveCount(0)
  // Still on offer, because the answer was no and nothing happened.
  await expect(page.getByText('was arranged')).toBeVisible()
})

test('the offer takes itself away once the day has been arranged', async ({ page }) => {
  await setUp(page)

  await open(page, `/day/${TARGET}`)
  await page.getByRole('button', { name: 'Bring it', exact: true }).click()
  await page.getByRole('button', { name: 'Bring it', exact: true }).last().click()
  await expect(page.getByRole('button', { name: 'Adjust Meditate' })).toBeVisible()

  await open(page, `/day/${TARGET}`)

  await expect(page.getByText('was arranged')).toHaveCount(0)
})
