import { expect, type Page } from '@playwright/test'

/**
 * Helpers that drive the real screens, rather than reaching into storage.
 *
 * Seeding IndexedDB directly would be faster and would also quietly stop testing the thing
 * these tests exist for. A unit test can assert what the domain does with a routine; only a
 * browser can tell you that the form actually writes one and the next screen reads it back.
 * So every precondition here is built the way a person would build it.
 */

/**
 * How long to allow for the app to appear inside `#app`.
 *
 * Generous on purpose, and only here. The dev server compiles and pre-bundles on the first
 * request for a module, so the very first screen a worker opens can take seconds while every
 * later one takes tens of milliseconds. That is the harness warming up, not the app being
 * slow, and a tight timeout here buys nothing but a suite that fails on its first run of the
 * day. Assertions about behaviour keep the default.
 */
const MOUNT_TIMEOUT_MS = 30_000

/**
 * Pages that have already been told this is not somebody's first launch.
 *
 * Every suite but one is about an app somebody is already using, and a browser context is
 * genuinely new every time — so without this, each of them would open onto the first run
 * instead of onto the screen it came to test. The exception marks itself with `firstRun`.
 */
const settled = new WeakSet<Page>()

export interface OpenOptions {
  /** Leave the device untouched, so the first run is offered exactly as it would be. */
  readonly firstRun?: boolean
}

/** Waits for the app to have mounted and finished its first read of the database. */
export async function open(page: Page, path = '/', options: OpenOptions = {}): Promise<void> {
  if (!options.firstRun && !settled.has(page)) {
    settled.add(page)
    // Written before any of the app's own scripts run, which is the only moment early enough:
    // the screen decides where to send you on its first read.
    await page.addInitScript(() => {
      globalThis.localStorage?.setItem(
        'some-kaisen.preferences',
        JSON.stringify({ clock: '24h', theme: 'system', started: true }),
      )
    })
  }

  await page.goto(path)
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: MOUNT_TIMEOUT_MS })
}

export interface HabitDraft {
  /** How long it usually takes, in minutes, when the test needs the builder to know. */
  readonly usualDurationMinutes?: number
  /**
   * Track an amount rather than done-or-not.
   *
   * Worth having in a helper because a measured habit is the only kind a test can *record* a
   * day for without a pointer gesture: it opens a dialog with a number in it, while a
   * "did it" habit is completed by swiping its row.
   */
  readonly measuredIn?: string
  /** `HH:mm`. The day then draws a card for it before anything has been planned. */
  readonly usualTime?: string
}

/**
 * Today as the app reckons it, which is the local date rather than the UTC one.
 *
 * `toISOString().slice(0, 10)` is the tempting one line version and is wrong for anyone east
 * of Greenwich in the evening or west of it in the morning — the test would ask for a day the
 * app is not on, and fail somewhere nobody is awake to see it.
 */
export function today(): string {
  const now = new Date()

  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-')
}

export async function createHabit(page: Page, name: string, draft: HabitDraft = {}): Promise<void> {
  await open(page, '/habits/new')

  if (draft.measuredIn !== undefined) {
    await page.getByText('Measured', { exact: true }).click()
    await page.getByLabel('Unit').fill(draft.measuredIn)
  }

  await page.locator('#habit-name').fill(name)

  if (draft.usualTime !== undefined) {
    await page.getByLabel('The time of day this habit usually happens').fill(draft.usualTime)
  }

  if (draft.usualDurationMinutes !== undefined) {
    await page
      .getByLabel('How long this habit usually takes, in minutes')
      .fill(String(draft.usualDurationMinutes))
  }

  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).not.toHaveURL(/\/habits\/new$/)
}

/**
 * Records an amount for a measured habit on today, which is a real answered day.
 *
 * Waits for the sheet to close before returning, and that wait is the whole point of it being
 * a helper. Saving writes to IndexedDB and then refetches; a test that navigated away on the
 * click alone would sometimes leave before the write landed, and would then fail on a later
 * assertion about data it had every reason to expect. It passed alone and failed in a full
 * run, which is the shape that costs an afternoon.
 */
export async function recordAmount(page: Page, name: string, amount: number): Promise<void> {
  await open(page, '/')
  await page.getByRole('button', { name: `Log ${name}` }).click()
  await page.getByLabel(/^Amount in /).fill(String(amount))
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByRole('dialog', { name: 'Record an amount' })).toBeHidden()
  // The row reads back the amount only once the refetch has landed, so this is the write
  // being visible rather than merely requested.
  await expect(page.getByRole('button', { name: `Log ${name}` })).toBeVisible()
  await expect(page.getByText(String(amount), { exact: false }).first()).toBeVisible()
}

export interface RoutineDraft {
  readonly name: string
  /** Habits to put in it, by name, in the order they should be performed. */
  readonly habits?: readonly string[]
  /** `HH:mm`, the shape the field itself uses. */
  readonly anchorTime?: string
}

export async function createRoutine(page: Page, draft: RoutineDraft): Promise<void> {
  await open(page, '/routines/new')
  await page.getByRole('textbox', { name: 'Name' }).fill(draft.name)

  // Tapped in the order given, because the order they are chosen in is the order they are
  // performed in — picking them by position would silently assert whatever order they are in.
  for (const habit of draft.habits ?? []) {
    await page.getByRole('button', { name: habit, exact: false }).first().click()
  }

  if (draft.anchorTime) {
    await page.getByLabel('The time of day this routine usually starts').fill(draft.anchorTime)
  }

  await page.getByRole('button', { name: 'Add routine' }).click()
  await expect(page).toHaveURL(/\/routines$/)
}
