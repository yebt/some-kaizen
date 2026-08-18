import { watch } from 'vue'

import { usePlatform } from '@core/platform-context'
import { useHabits } from '@modules/habits/application/habit-queries'
import { usePlannedInstances } from '@modules/planning/application/planning-queries'
import { pendingReminders } from '@modules/reminders/domain/reminder-schedule'

/**
 * Keeps the phone's pending notifications equal to what the plan actually says.
 *
 * Driven by the stored data rather than by each screen remembering to reschedule. Moving an
 * occurrence, deleting a habit and restoring a backup all change which reminders should
 * exist, and none of those places should have to know that notifications are a thing.
 *
 * The scheduler replaces the whole set each time, so this is safe to run as often as the
 * data changes.
 */
export function useReminderSync(): void {
  const platform = usePlatform()
  const { data: habits } = useHabits()
  const { data: instances } = usePlannedInstances()

  watch(
    [habits, instances],
    ([currentHabits, currentInstances]) => {
      if (!currentHabits || !currentInstances) return

      void platform.reminders.sync(pendingReminders(currentHabits, currentInstances, new Date()))
    },
    { immediate: true },
  )
}
