import { expect, test, type Page } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * Whole journeys over rich data, looking for what happens where features meet.
 *
 * Every other file here tests one feature at a time, and each of those passes. These do not
 * add coverage of any single rule; they cross the seams — preset into builder into carry into
 * statistics — because that is where a set of individually correct features turns out to
 * disagree with itself. Rich data rather than one habit, for the same reason: a rule that
 * looks obviously right on one row is where an off-by-one hides on fourteen.
 */

/** Two days a week apart, both ahead of today so every habit is already active on them. */
function daysFromToday(amount: number): string {
  const date = new Date()

  date.setDate(date.getDate() + amount)

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

const TOMORROW = daysFromToday(1)
const NEXT_WEEK = daysFromToday(8)

/**
 * The worked example the app ships: four habits of three kinds, two routines, recorded
 * history, planned occurrences and two blocks of fixed time.
 */
async function loadDemo(page: Page): Promise<void> {
  await open(page, '/settings')
  await page.getByRole('button', { name: 'Show the destructive actions' }).click()
  await page.getByRole('button', { name: 'Replace with demo data' }).click()
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await expect(page.getByText('Demo data loaded')).toBeVisible()
}

async function addPreset(page: Page, name: string): Promise<void> {
  await open(page, '/routines/presets')
  await page.getByRole('button', { name: `Add ${name}` }).click()
  await page.getByRole('button', { name: 'Add it' }).click()
  await expect(page).toHaveURL(/\/routines$/)
}

async function buildInto(page: Page, routine: string, date: string, start: string): Promise<void> {
  await open(page, '/routines')
  await page.getByRole('button', { name: `Actions for ${routine}` }).click()
  await page.getByRole('button', { name: 'Build into a day' }).click()
  await page.getByLabel('The day to build into').fill(date)
  await page.getByLabel('The time this routine starts').fill(start)
  await page.getByRole('button', { name: 'Build the day' }).click()
  await expect(page).toHaveURL(new RegExp(`/day/${date}$`))
}

test('the shipped demo survives every screen without the browser complaining', async ({ page }) => {
  // The demo is what a new person is shown, and it exercises all three habit kinds at once.
  // If any screen cannot render it, that is the first thing anybody sees.
  const complaints: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') complaints.push(message.text())
  })
  page.on('pageerror', (error) => complaints.push(`Uncaught: ${error.message}`))

  await loadDemo(page)

  for (const route of ['/', '/habits', '/routines', '/plan', '/block-time', '/stats']) {
    await open(page, route)
    await expect(page.locator('h1').first()).toBeVisible()
  }

  expect(complaints).toEqual([])
})

test('a preset lands on top of real data without duplicating what is already there', async ({
  page,
}) => {
  await loadDemo(page)
  // "Read" is a step of 20/20/20 and does not exist in the demo; "Meditate" does not appear
  // in that preset. Creating Read first is what puts the merge under test.
  await createHabit(page, 'Read')

  await open(page, '/routines/presets')
  // Two of the bundled presets contain a step called "Read", so both rows say so. Counted
  // rather than found, because a lone `toBeVisible` would fail on the ambiguity and read as
  // the feature being broken.
  await expect(page.getByText('Uses 1 habit you already track')).toHaveCount(2)

  await addPreset(page, '20/20/20')

  await open(page, '/habits')

  await expect(page.getByText('Read', { exact: true })).toHaveCount(1)
  // The demo's own habits are untouched by an import that only claimed one of them.
  await expect(page.getByText('Meditate').first()).toBeVisible()
})

test('preset to builder to carry: the times survive the whole chain', async ({ page }) => {
  await addPreset(page, 'The calm 15')

  // The preset's lengths came with it, so the builder needs nothing typed but a start.
  await buildInto(page, 'The calm 15', TOMORROW, '06:00')

  await expect(page.getByRole('button', { name: 'Set the exact time of Breathe' })).toContainText(
    '06:00',
  )
  await expect(page.getByRole('button', { name: 'Set the exact time of Stretch' })).toContainText(
    '06:05',
  )

  // A week later is the same weekday, so the day offers to bring it forward.
  await open(page, `/day/${NEXT_WEEK}`)
  await page.getByRole('button', { name: 'Bring a plan' }).click()
  await page.getByRole('button', { name: 'Bring it', exact: true }).click()

  await expect(page.getByRole('button', { name: 'Set the exact time of Breathe' })).toContainText(
    '06:00',
  )
  await expect(page.getByRole('button', { name: 'Set the exact time of Stretch' })).toContainText(
    '06:05',
  )
})

test('a built day overrides the habit’s usual hour for that day only', async ({ page }) => {
  /*
   * The two features disagree on purpose, and the occurrence has to win. A habit that usually
   * happens at 20:00, built into a morning routine at 06:00, must be at 06:00 on that day —
   * and must still be at 20:00 on a day nobody has built.
   */
  await open(page, '/habits/new')
  await page.locator('#habit-name').fill('Stretch')
  await page.getByLabel('The time of day this habit usually happens').fill('20:00')
  await page.getByLabel('How long this habit usually takes, in minutes').fill('10')
  await page.getByRole('button', { name: 'Create' }).click()
  // Waited for before navigating on. The step below leaves with a real page load, and going
  // on the click alone races the write — which reads as the routine picker being broken.
  await expect(page).not.toHaveURL(/\/habits\/new$/)

  await createRoutine(page, { name: 'Morning', habits: ['Stretch'], anchorTime: '06:00' })
  await buildInto(page, 'Morning', TOMORROW, '06:00')

  await expect(page.getByRole('button', { name: 'Set the exact time of Stretch' })).toContainText(
    '06:00',
  )

  // A different day, which nobody built, still opens at the hour the habit states.
  await open(page, `/day/${NEXT_WEEK}`)

  await expect(page.getByRole('button', { name: 'Set the exact time of Stretch' })).toContainText(
    '20:00',
  )
})

test('filling a day is not doing it: planning leaves the statistics alone', async ({ page }) => {
  // Easy to get wrong and quietly flattering if you do. Building writes occurrences, and an
  // occurrence is a plan; only an entry is a day you answered.
  await addPreset(page, 'The calm 15')
  await buildInto(page, 'The calm 15', TOMORROW, '06:00')

  await open(page, '/stats')

  const daysRecorded = page.getByLabel('Overall').getByText('days recorded').locator('..')

  await expect(daysRecorded).toContainText('0')
  await expect(page.getByText('Not enough answered days')).toBeVisible()
})

test('archiving a routine takes it out of the day without touching its habits', async ({
  page,
}) => {
  await addPreset(page, 'The calm 15')

  await open(page, '/routines')
  await page.getByRole('button', { name: 'Actions for The calm 15' }).click()
  await page.getByRole('button', { name: 'Archive' }).click()

  // Seen on the row before leaving the screen, so the assertion below is about the day rather
  // than about whether the write had landed. On the row rather than on the word alone: the
  // toast says "archived" too, and matching both would be a locator failing over its own
  // ambiguity while looking exactly like the feature being broken.
  await expect(page.getByText('3 habits · archived')).toBeVisible()

  await open(page, `/day/${TOMORROW}`)

  // Nothing left to build into this day, so the offer is gone.
  await expect(page.getByRole('button', { name: 'Build a routine' })).toHaveCount(0)

  // The habits it held are still tracked; archiving a routine is not deleting a habit.
  await open(page, '/habits')
  await expect(page.getByText('Breathe').first()).toBeVisible()
})

test('removing a habit takes its built cards with it and leaves the routine standing', async ({
  page,
}) => {
  await addPreset(page, 'The calm 15')
  await buildInto(page, 'The calm 15', TOMORROW, '06:00')

  await open(page, '/habits')
  await page.getByRole('button', { name: 'Actions for Breathe' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).last().click()

  /*
   * Waited for on the screen that performed it, before leaving it.
   *
   * Deleting cascades through occurrences and entries before removing the habit, and the
   * helper below navigates with a real page load. Leaving on the click alone raced the
   * cascade — the reload could arrive mid-write. It reads as a bug in the delete and is a
   * bug in the test, and the order the cascade uses is already the defensive one: the habit
   * goes last, so an interruption leaves something you can delete again rather than orphans
   * with nothing left to reach them by.
   *
   * On the row's own control rather than on the name: a toast confirming the deletion carries
   * the name too, so waiting for the name to disappear is waiting for an animation.
   */
  await expect(page.getByRole('button', { name: 'Actions for Breathe' })).toHaveCount(0)

  await open(page, `/day/${TOMORROW}`)

  await expect(page.getByRole('button', { name: 'Set the exact time of Breathe' })).toHaveCount(0)
  // The two steps that remain kept the hours they were given.
  await expect(page.getByRole('button', { name: 'Set the exact time of Stretch' })).toContainText(
    '06:05',
  )

  await open(page, '/routines')
  await expect(page.getByText('2 habits')).toBeVisible()
})

test('two presets sharing a step hand it over rather than duplicating it', async ({ page }) => {
  /*
   * An interaction nobody designed: "Read" is a step of both 20/20/20 and Wind down. Adding
   * one and then the other exercises the merge against the app's own shipped data, and the
   * rule that a habit belongs to at most one routine has to hold across an import as much as
   * across a hand edit — otherwise Read is in two routines and the day counts it twice.
   */
  await addPreset(page, '20/20/20')
  await addPreset(page, 'Wind down')

  await open(page, '/habits')
  await expect(page.getByText('Read', { exact: true })).toHaveCount(1)

  await open(page, '/routines')

  // Wind down took it, so it holds all three of its steps and 20/20/20 is left with two.
  await expect(page.getByText('3 habits')).toHaveCount(1)
  await expect(page.getByText('2 habits')).toHaveCount(1)
})

test('two routines with hours read in the order the day is lived', async ({ page }) => {
  await addPreset(page, 'Wind down')
  await addPreset(page, 'The calm 15')

  await open(page, '/routines')

  const names = await page.locator('li p.truncate').allInnerTexts()
  const morning = names.findIndex((text) => text.includes('The calm 15'))
  const evening = names.findIndex((text) => text.includes('Wind down'))

  // Added in the wrong order on purpose: 07:00 must come before 21:30 whatever order they
  // were created in, or the list is something you have to translate before reading.
  expect(morning).toBeLessThan(evening)
})
