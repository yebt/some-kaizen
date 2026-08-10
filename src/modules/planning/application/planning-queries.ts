import { useMutation, useQuery, useQueryCache } from '@pinia/colada'

import { usePersistence } from '@core/persistence-context'
import type { Identifier } from '@shared/domain/identifier'
import type { PlannedInstance } from '@modules/planning/domain/planned-instance'

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
    onSettled: () => cache.invalidateQueries({ key: INSTANCES_KEY }),
  })
}

export function useRemoveInstance() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (id: Identifier) => persistence.instances.remove(id),
    onSettled: () => cache.invalidateQueries({ key: INSTANCES_KEY }),
  })
}
