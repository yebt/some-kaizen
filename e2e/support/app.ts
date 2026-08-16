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

/** Waits for the app to have mounted and finished its first read of the database. */
export async function open(page: Page, path = '/'): Promise<void> {
  await page.goto(path)
  await expect(page.locator('#app')).not.toBeEmpty({ timeout: MOUNT_TIMEOUT_MS })
}

export async function createHabit(page: Page, name: string): Promise<void> {
  await open(page, '/habits/new')
  await page.locator('#habit-name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await expect(page).not.toHaveURL(/\/habits\/new$/)
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
