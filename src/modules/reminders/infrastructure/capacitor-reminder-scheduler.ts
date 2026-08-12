import { LocalNotifications } from '@capacitor/local-notifications'

import type {
  PermissionOutcome,
  ReminderScheduler,
} from '@modules/reminders/domain/reminder-scheduler'

/**
 * Delivers reminders through the platform's own notification service.
 *
 * Android 13 and later require the POST_NOTIFICATIONS permission at runtime, so it is asked
 * for the first time a reminder is actually set rather than on launch. Being asked "can
 * this app notify you?" before you have expressed any interest in being notified is how an
 * app earns a permanent no.
 */
export function createCapacitorReminderScheduler(): ReminderScheduler {
  return {
    async ensurePermission(): Promise<PermissionOutcome> {
      const current = await LocalNotifications.checkPermissions()

      if (current.display === 'granted') return 'granted'

      const requested = await LocalNotifications.requestPermissions()

      return requested.display === 'granted' ? 'granted' : 'denied'
    },

    async sync(reminders) {
      const pending = await LocalNotifications.getPending()

      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications })
      }

      if (reminders.length === 0) return

      await LocalNotifications.schedule({
        notifications: reminders.map((reminder) => ({
          id: reminder.id,
          title: reminder.title,
          body: reminder.body,
          // `allowWhileIdle` is what gets a reminder through Doze, which is exactly when a
          // morning habit reminder would otherwise be silently deferred for hours.
          schedule: { at: reminder.at, allowWhileIdle: true },
        })),
      })
    },
  }
}
