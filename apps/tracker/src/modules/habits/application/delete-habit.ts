import type { Persistence } from '@core/persistence'
import type { Identifier } from '@shared/domain/identifier'

/**
 * Removes a habit along with everything that only existed because of it.
 *
 * Occurrences and entries reference a habit by id and mean nothing without it: an orphaned
 * occurrence cannot be planned, moved or completed, and an orphaned entry counts toward no
 * statistic. Leaving them behind would quietly grow a pile of records the user can neither
 * see nor delete.
 *
 * This is why deleting is offered alongside archiving rather than instead of it. Archiving
 * keeps the history and stops the habit appearing; deleting is for a habit created by
 * mistake, and it takes its history with it.
 */
export async function deleteHabitCascade(
  persistence: Persistence,
  habitId: Identifier,
): Promise<void> {
  const [instances, entries] = await Promise.all([
    persistence.instances.all(),
    persistence.entries.all(),
  ])

  for (const instance of instances) {
    if (instance.habitId === habitId) await persistence.instances.remove(instance.id)
  }

  for (const entry of entries) {
    if (entry.habitId === habitId) await persistence.entries.remove(entry.id)
  }

  await persistence.habits.remove(habitId)
}
