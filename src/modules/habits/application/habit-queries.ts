import { useMutation, useQuery, useQueryCache } from '@pinia/colada'

import { usePersistence } from '@core/persistence-context'
import type { Identifier } from '@shared/domain/identifier'
import type { Habit } from '@modules/habits/domain/habit'
import type { HabitEntry } from '@modules/habits/domain/habit-entry'

export const HABITS_KEY = ['habits'] as const
export const ENTRIES_KEY = ['entries'] as const

export function useHabits() {
  const persistence = usePersistence()

  return useQuery({ key: HABITS_KEY, query: () => persistence.habits.all() })
}

export function useHabitEntries() {
  const persistence = usePersistence()

  return useQuery({ key: ENTRIES_KEY, query: () => persistence.entries.all() })
}

export function useSaveHabit() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (habit: Habit) => persistence.habits.save(habit),
    onSettled: () => cache.invalidateQueries({ key: HABITS_KEY }),
  })
}

export function useRemoveHabit() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (id: Identifier) => persistence.habits.remove(id),
    onSettled: () => cache.invalidateQueries({ key: HABITS_KEY }),
  })
}

/**
 * Records an outcome for a day.
 *
 * Entries are appended rather than edited, so correcting yesterday's answer adds a newer
 * verdict instead of rewriting the original. The statistics already read the latest entry
 * per day, which keeps the history honest about having been changed.
 */
export function useRecordEntry() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (entry: HabitEntry) => persistence.entries.save(entry),
    onSettled: () => cache.invalidateQueries({ key: ENTRIES_KEY }),
  })
}
