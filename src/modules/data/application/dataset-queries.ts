import { useMutation, useQueryCache } from '@pinia/colada'

import { usePersistence } from '@core/persistence-context'
import type { Persistence } from '@core/persistence'
import { ENTRIES_KEY, HABITS_KEY } from '@modules/habits/application/habit-queries'
import { INSTANCES_KEY } from '@modules/planning/application/planning-queries'
import { BLOCKS_KEY } from '@modules/block-time/application/block-time-queries'
import type { Dataset } from '@modules/data/domain/dataset'

/**
 * Writes a whole dataset over whatever is stored.
 *
 * Replacing rather than merging, because the four collections reference each other: a
 * merge could leave occurrences pointing at habits the incoming data does not contain.
 */
export async function replaceDataset(persistence: Persistence, dataset: Dataset): Promise<void> {
  await persistence.habits.replaceAll(dataset.habits)
  await persistence.entries.replaceAll(dataset.entries)
  await persistence.instances.replaceAll(dataset.instances)
  await persistence.blocks.replaceAll(dataset.blocks)
}

export function useReplaceDataset() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (dataset: Dataset) => replaceDataset(persistence, dataset),
    onSettled: async () => {
      for (const key of [HABITS_KEY, ENTRIES_KEY, INSTANCES_KEY, BLOCKS_KEY]) {
        await cache.invalidateQueries({ key })
      }
    },
  })
}
