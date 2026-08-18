import { expect, test } from '@playwright/test'

import { open } from './support/app'

/**
 * The symbol a habit is recognised by.
 *
 * A drawn set at one stroke weight rather than emoji, and the browser is the only place that
 * distinction is visible at all: jsdom reports every element at zero size and renders no
 * glyphs, so "the mark is drawn, and it is drawn the same on both engines" is unprovable
 * there by construction.
 */

test('a symbol chosen on the form is drawn on the list', async ({ page }) => {
  await open(page, '/habits/new')
  await page.locator('#habit-name').fill('Read')
  await page.getByRole('button', { name: 'read', exact: true }).click()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).not.toHaveURL(/\/habits\/new$/)

  await open(page, '/habits')

  const mark = page.locator('[data-habit-mark]').first()

  await expect(mark).toBeVisible()
  await expect(mark.locator('svg')).toBeVisible()
})

test('a symbol is drawn without a colour, and a colour without a symbol', async ({ page }) => {
  // Plenty of people will choose one and leave the other alone. A mark that only appeared
  // once both were set would read as the picker not having worked.
  await open(page, '/habits/new')
  await page.locator('#habit-name').fill('Read')
  await page.getByRole('button', { name: 'read', exact: true }).click()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).not.toHaveURL(/\/habits\/new$/)

  await open(page, '/habits')

  const box = await page.locator('[data-habit-mark]').first().boundingBox()

  expect(box?.width).toBeGreaterThan(0)
  expect(box?.height).toBeGreaterThan(0)
})

test('a habit with neither is left unmarked rather than given an empty circle', async ({
  page,
}) => {
  await open(page, '/habits/new')
  await page.locator('#habit-name').fill('Run')
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).not.toHaveURL(/\/habits\/new$/)

  await open(page, '/habits')

  await expect(page.locator('[data-habit-mark]')).toHaveCount(0)
})

test('the symbol survives an edit and shows on the habit’s own page', async ({ page }) => {
  await open(page, '/habits/new')
  await page.locator('#habit-name').fill('Read')
  await page.getByRole('button', { name: 'read', exact: true }).click()
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).not.toHaveURL(/\/habits\/new$/)

  await open(page, '/habits')
  await page.getByText('Read', { exact: true }).click()

  await expect(page.locator('[data-habit-mark] svg')).toBeVisible()

  await page.getByRole('link', { name: 'Edit' }).click()

  await expect(page.getByRole('button', { name: 'read', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})
