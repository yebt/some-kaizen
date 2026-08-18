import { expect, test } from '@playwright/test'

import { open, today } from './support/app'
import { buildWorkedExample } from './support/worked-example'

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
  /*
   * Loaded through the application's own import, which means the readers, the constructors
   * and the storage are all the real ones. The pictures are of the app rendering records it
   * accepted, not of a mock-up wearing its clothes.
   */
  const example = buildWorkedExample()

  await open(page, '/settings')
  await page.getByRole('button', { name: 'Show the destructive actions' }).click()

  const choosing = page.waitForEvent('filechooser')

  await page.getByRole('button', { name: 'Replace from a file' }).click()
  await (await choosing).setFiles({
    name: 'worked-example.json',
    mimeType: 'application/json',
    buffer: Buffer.from(example.json),
  })
  await page.getByRole('button', { name: /Replace/ }).last().click()
  await expect(page.getByText(/replaced/i)).toBeVisible({ timeout: 15_000 })

  // The floating bar belongs to the app, not to the thing a crop is pointing at, and an
  // element screenshot captures whatever overlaps it.
  const hideBar = 'nav[aria-label="Main"] { display: none !important; }'

  await open(page, '/')
  await expect(page.getByRole('link', { name: 'Open the timeline' })).toBeVisible()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${PLATES}/today.png` })

  await open(page, '/plan')
  await page.waitForTimeout(400)
  // The part of the board where anything happens. The five empty days below it are true and
  // say nothing, and a plate is a crop of the argument rather than a picture of a screen.
  await page.screenshot({
    path: `${PLATES}/plan-top.png`,
    clip: { x: 0, y: 118, width: 390, height: 400 },
  })

  /*
   * Details, cut to the thing being pointed at.
   *
   * A full phone screen shrunk into a column is a picture of an app; a crop at legible size
   * is a picture of a decision. The page uses both, and these are the ones the callouts
   * actually land on.
   */
  await open(page, '/')
  await page.addStyleTag({ content: hideBar })
  await page.waitForTimeout(400)
  // The card itself, not the section around it: a section screenshot clips its own heading.
  await page.locator('div.rounded-card', { hasText: '75 Hard' }).first().screenshot({
    path: `${PLATES}/detail-challenge.png`,
  })
  await page.locator('li', { hasText: 'did you avoid it?' }).first().screenshot({
    path: `${PLATES}/detail-quitting.png`,
  })

  await open(page, '/stats')
  await page.addStyleTag({ content: hideBar })
  await page.waitForTimeout(500)
  await page.getByLabel('Rate by day of the week').screenshot({
    path: `${PLATES}/detail-weekdays.png`,
  })

  await open(page, '/habits')
  await page.addStyleTag({ content: hideBar })
  await page.getByText('Drink water').first().click()
  await expect(page.getByLabel('Daily history').first()).toBeVisible()
  await page.waitForTimeout(300)
  await page.getByLabel('Daily history').first().screenshot({
    path: `${PLATES}/detail-heatmap.png`,
  })

  await open(page, `/day/${today()}`)
  await page.waitForTimeout(400)
  await page.evaluate(() => globalThis.scrollTo(0, 340))
  await page.waitForTimeout(200)
  // 06:00 to 09:30: sleep ending, a habit standing on its hour, work beginning under it.
  await page.screenshot({
    path: `${PLATES}/detail-hours.png`,
    clip: { x: 0, y: 150, width: 390, height: 320 },
  })
})
