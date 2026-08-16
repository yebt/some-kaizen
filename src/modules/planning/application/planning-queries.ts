import { useMutation, useQuery, useQueryCache } from '@pinia/colada'

import { usePersistence } from '@core/persistence-context'
import type { CalendarDate } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import type { PlannedInstance } from '@modules/planning/domain/planned-instance'
import type { RoutineCascade } from '@modules/planning/domain/routine-plan'

import { buildRoutine } from './build-routine'

export const INSTANCES_KEY = ['instances'] as const

export function usePlannedInstances() {
  const persistence = usePersistence()

  return useQuery({ key: INSTANCES_KEY, query: () => persistence.instances.all() })
}

export function useSaveInstance() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (instance: PlannedInstance) => persistence.instances.save(instance),
    onSettled: () => cache.invalidateQueries({ key: INSTANCES_KEY }, true),
  })
}

/**
 * Fills a day from a routine, in one gesture.
 *
 * The third way to fill a day, and the only one that writes several occurrences at once — so
 * it is also the only one where a screen reading between the writes would show a half built
 * morning. The cache is invalidated once, after all of it has landed.
 */
export function useBuildRoutine() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: ({ cascade, date }: { cascade: RoutineCascade; date: CalendarDate }) =>
      buildRoutine(persistence, cascade, date),
    onSettled: () => cache.invalidateQueries({ key: INSTANCES_KEY }, true),
  })
}

export function useRemoveInstance() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (id: Identifier) => persistence.instances.remove(id),
    onSettled: () => cache.invalidateQueries({ key: INSTANCES_KEY }, true),
  })
}
