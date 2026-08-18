import { expect, test, type Page } from '@playwright/test'

import { createHabit, open } from './support/app'

/**
 * Starting a programme and running it, driven the way a person drives it.
 *
 * The rule that makes a challenge different from a habit — one miss and you are back at day
 * one — is proved by unit tests over the domain, where a fifth day can be arranged without
 * waiting five days. What a browser adds is the wiring: that the screen is reachable, that
 * the punishment is stated before the commitment rather than after the first miss, and that
 * the ticking happens on the day rather than somewhere you have to go and find.
 */

async function startHard(page: Page): Promise<void> {
  await open(page, '/challenges')
  await page.getByRole('button', { name: 'Start 75 Hard' }).click()
  await page.getByRole('button', { name: 'Start today' }).click()
  await expect(page).toHaveURL(/\/$/)
}

test('the screen is reachable from the habits header', async ({ page }) => {
  await open(page, '/habits')
  await page.getByRole('link', { name: 'Challenges' }).click()

  await expect(page.getByRole('heading', { name: 'Challenges' })).toBeVisible()
})

test('the rule is stated before the commitment, not after the first miss', async ({ page }) => {
  await open(page, '/challenges')
  await page.getByRole('button', { name: 'Start 75 Hard' }).click()

  // Scoped to the dialog: the card's own summary says much the same thing, and a loose
  // match would pass on the description while the question said nothing.
  const question = page.getByRole('dialog')

  await expect(question).toContainText('back to day one')

  // And the forgiving one says so just as plainly.
  await page.getByRole('button', { name: 'Cancel' }).click()
  await page.getByRole('button', { name: 'Start The 30 day reset' }).click()

  await expect(page.getByRole('dialog')).toContainText('not a reset')
})

test('starting one puts it on the day, with everything it asks for', async ({ page }) => {
  await startHard(page)

  await expect(page.getByRole('heading', { name: 'Programmes' })).toBeVisible()
  await expect(page.getByText('Day 1 of 75')).toBeVisible()
  await expect(page.getByRole('button', { name: /Two workouts, one outdoors/ })).toBeVisible()
})

test('a programme shows on the day even with no habits at all', async ({ page }) => {
  // The independence is the whole reason it is modelled apart. Somebody running 75 Hard with
  // nothing else tracked must not open the app to "No habits yet" and no sign of it.
  await startHard(page)

  await expect(page.getByText('No habits yet')).toBeVisible()
  await expect(page.getByText('Day 1 of 75')).toBeVisible()
})

test('a task is ticked and untucked without the day being claimed', async ({ page }) => {
  await startHard(page)

  const task = page.getByRole('button', { name: /Two workouts, one outdoors/ })

  await task.click()
  await expect(task).toHaveAttribute('aria-pressed', 'true')

  // Three of four at six in the evening is a real state: one tick is not the day.
  await expect(page.getByText('back to day one')).toBeVisible()

  await task.click()
  await expect(task).toHaveAttribute('aria-pressed', 'false')
})

test('what was ticked survives a reload, because it is on the device', async ({ page }) => {
  await startHard(page)

  await page.getByRole('button', { name: /Read ten pages of non-fiction/ }).click()
  await expect(page.getByRole('button', { name: /Read ten pages of non-fiction/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await open(page, '/')

  await expect(page.getByRole('button', { name: /Read ten pages of non-fiction/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('giving up keeps what was done and takes it off the day', async ({ page }) => {
  await startHard(page)
  await page.getByRole('button', { name: /Take a progress photo/ }).click()
  await expect(page.getByRole('button', { name: /Take a progress photo/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  await open(page, '/challenges')
  await page.getByRole('button', { name: 'Actions for 75 Hard' }).click()
  await page.getByRole('button', { name: /Give up on it/ }).click()

  await expect(page.getByText(/Given up on day/)).toBeVisible()

  await open(page, '/')

  await expect(page.getByRole('heading', { name: 'Programmes' })).toHaveCount(0)
})

test('the habits underneath are untouched by any of it', async ({ page }) => {
  // The point of modelling it apart: a programme is not a habit and does not become one.
  await createHabit(page, 'Meditate')
  await startHard(page)

  await open(page, '/habits')

  await expect(page.getByText('Meditate', { exact: true })).toBeVisible()
  await expect(page.getByText('75 Hard')).toHaveCount(0)
})

/**
 * A programme somebody wrote themselves.
 *
 * The two bundled ones are the common answers, not the only ones — somebody with a coach or
 * a rule of their own has exactly the same shape to describe. Driven in a browser because a
 * list of rows that can be added to is the kind of thing that works in jsdom and fails on a
 * real form, and because the day is the only place that proves it was really started.
 */
test('one written by hand runs like any other', async ({ page }) => {
  await open(page, '/challenges')

  await page.getByRole('link', { name: /Write your own/ }).click()

  await page.getByLabel('Name').fill('Winter build')
  await page.getByLabel('How many days').fill('20')
  await page.getByRole('textbox', { name: 'Thing 1', exact: true }).fill('Swim')
  await page.getByRole('textbox', { name: 'Thing 2', exact: true }).fill('Read ten pages')
  await page.getByRole('button', { name: 'Add another thing' }).click()
  await page.getByRole('textbox', { name: 'Thing 4', exact: true }).fill('Get outside')

  // The commitment is read back while it is written, so a 20 typed where 200 was meant is
  // caught before it is agreed to rather than after.
  await expect(page.locator('[data-commitment]')).toContainText('20 days of 3 things')

  await page.getByRole('button', { name: 'A missed day is just a missed day' }).click()
  await page.getByRole('button', { name: 'Start it' }).click()

  await expect(page).toHaveURL(/\/challenges$/)
  await expect(page.getByLabel('Your programmes')).toContainText('Winter build')
  await expect(page.getByLabel('Your programmes')).toContainText('Day 1 of 20')

  // And it is on the day, which is the only place that proves it really started.
  await open(page, '/')
  await expect(page.getByText('Winter build')).toBeVisible()
  await expect(page.getByText('Get outside')).toBeVisible()
})
