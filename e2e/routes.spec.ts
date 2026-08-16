import { expect, test, type Page } from '@playwright/test'

import { createHabit, createRoutine, open } from './support/app'

/**
 * Every screen, visited, and asserted on what it actually renders.
 *
 * This exists because of a bug it caught: two pages used `<BackLink>` without importing it,
 * so the way out of those forms silently did not render. Nothing in the existing gate saw
 * it — an unresolved component is a runtime lookup rather than a type, and the unit tests
 * never asserted the link was there.
 *
 * The first instinct was to fail on Vue's console warning, and that instinct was wrong twice
 * over. A production build strips those warnings, so against the artifact that actually ships
 * the console stays silent whether the component resolved or not. And a missing back link is
 * a *visible* defect, so the honest assertion is that the control is on the screen. The
 * console watch is kept underneath as a second net, because uncaught errors and real
 * `console.error` calls do survive the build.
 */

/** Collects everything the page complains about, so a test can assert there was nothing. */
function watchConsole(page: Page): string[] {
  const complaints: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      complaints.push(message.text())
    }
  })

  page.on('pageerror', (error) => complaints.push(`Uncaught: ${error.message}`))

  return complaints
}

/**
 * That the route resolved to a screen rather than to a blank page.
 *
 * The heading rather than the tab bar, because form and timeline screens hide the bar on
 * purpose — they carry their own way out — and a blank page would trivially have nothing to
 * complain about, which would make the console assertion pass for the wrong reason.
 */
async function expectScreen(page: Page): Promise<void> {
  await expect(page.locator('h1').first()).toBeVisible()
}

const ROUTES = [
  '/',
  '/habits',
  '/habits/new',
  '/routines',
  '/routines/new',
  '/plan',
  '/block-time',
  '/block-time/new',
  '/settings',
  '/stats',
] as const

for (const route of ROUTES) {
  test(`${route} renders without the browser complaining`, async ({ page }) => {
    const complaints = watchConsole(page)

    await open(page, route)
    await expectScreen(page)

    expect(complaints).toEqual([])
  })
}

/**
 * Screens with no tab bar, and the way out each one promises instead.
 *
 * Every one of these hides the bar because it carries its own exit. If that exit is not
 * rendered, the screen is a trap you leave with the browser's back button or not at all —
 * and on a phone wrapped in Capacitor there is no browser back button.
 */
const WAYS_OUT = [
  { route: '/habits/new', back: 'Habits' },
  { route: '/block-time/new', back: 'Block time' },
  { route: '/routines/new', back: 'Routines' },
] as const

for (const { route, back } of WAYS_OUT) {
  test(`${route} offers its way out`, async ({ page }) => {
    await open(page, route)

    await expect(page.getByRole('button', { name: back, exact: true })).toBeVisible()
  })
}

test('the screens reached only through a record render cleanly too', async ({ page }) => {
  await createHabit(page, 'Meditate')
  await createRoutine(page, { name: 'Morning', habits: ['Meditate'] })

  // Watched from here, so the setup above is not what is being judged.
  const complaints = watchConsole(page)

  await open(page, '/habits')
  await page.getByText('Meditate').first().click()
  await expectScreen(page)
  await expect(page.getByRole('button', { name: 'Habits', exact: true })).toBeVisible()

  await open(page, '/routines')
  await page.getByText('Morning').first().click()
  await expectScreen(page)

  expect(complaints).toEqual([])
})

test('the day timeline renders and can be left again', async ({ page }) => {
  await createHabit(page, 'Meditate')

  const complaints = watchConsole(page)

  await open(page, '/')
  await page.getByRole('link', { name: 'Open the timeline' }).click()
  await expectScreen(page)
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toBeVisible()

  expect(complaints).toEqual([])
})
