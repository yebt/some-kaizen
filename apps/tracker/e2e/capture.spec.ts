import { expect, test } from '@playwright/test'

import { open, today } from './support/app'

/**
 * Captures the plates the site is built out of.
 *
 * Not a test. It runs in this harness because this harness is the only thing that can drive
 * the real application to a real state — the site's imagery is the app doing its job, and a
 * drawing of an interface is a claim about a product rather than a picture of one.
 *
 * Run with: bunx playwright test e2e/capture.spec.ts --project=chromium
 */

const PLATES = '../landing/src/assets/plates'

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 })

test('capture', async ({ page }) => {
  // The app's own worked example, so the screenshots show what it ships with rather than
  // something staged for a photograph.
  await open(page, '/settings')
  await page.getByRole('button', { name: 'Replace with demo data' }).click()
  await page.getByRole('button', { name: 'Replace', exact: true }).click()
  await expect(page.getByText('Demo data loaded')).toBeVisible()

  await open(page, '/')
  await expect(page.getByRole('link', { name: 'Open the timeline' })).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${PLATES}/today.png` })

  await open(page, `/day/${today()}`)
  await expect(page.getByRole('heading', { name: 'Day' })).toBeVisible()
  await page.waitForTimeout(400)
  // Scrolled to the working part of the day rather than to midnight.
  await page.evaluate(() => globalThis.scrollTo(0, 340))
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${PLATES}/day.png` })

  await open(page, '/plan')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${PLATES}/plan.png` })

  await open(page, '/stats')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${PLATES}/stats.png` })

  await open(page, '/habits')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${PLATES}/habits.png` })

  await open(page, '/challenges')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${PLATES}/challenges.png` })

  await open(page, '/block-time')
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${PLATES}/blocks.png` })
})
