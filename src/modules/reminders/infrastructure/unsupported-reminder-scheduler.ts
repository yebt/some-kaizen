import type { ReminderScheduler } from '@modules/reminders/domain/reminder-scheduler'

/**
 * The browser implementation, which honestly does nothing.
 *
 * Web notifications need the tab or a service worker to be alive, and on Android they are
 * routinely dropped, so a reminder set in a browser tab would be a promise the app cannot
 * keep. Reporting `unsupported` lets the screens say "install the app for these to fire"
 * rather than showing a bell that quietly means nothing.
 */
export function createUnsupportedReminderScheduler(): ReminderScheduler {
  return {
    ensurePermission: async () => 'unsupported',
    sync: async () => undefined,
  }
}
