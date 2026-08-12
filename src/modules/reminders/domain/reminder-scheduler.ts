import type { ScheduledReminder } from './reminder-schedule'

export type PermissionOutcome = 'granted' | 'denied' | 'unsupported'

/**
 * Handing reminders to whatever can actually deliver them.
 *
 * A port because only the native shell can wake a phone. The browser cannot promise it, so
 * rather than pretend, the web implementation reports `unsupported` and the screens say so
 * instead of showing a bell that silently does nothing.
 */
export interface ReminderScheduler {
  /** Whether reminders can be delivered at all here, asking the user if that is needed. */
  ensurePermission(): Promise<PermissionOutcome>
  /**
   * Replaces every pending reminder with this list.
   *
   * Replacing rather than adding, because the stored plan is the truth: a reminder deleted
   * on one screen has to stop existing on the phone, and re-scheduling the same occurrence
   * must not leave two notifications behind.
   */
  sync(reminders: readonly ScheduledReminder[]): Promise<void>
}
