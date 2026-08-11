import { useMutation, useQuery, useQueryCache } from '@pinia/colada'

import { usePersistence } from '@core/persistence-context'
import type { Identifier } from '@shared/domain/identifier'
import { addBlock, type BlockTime } from '@modules/block-time/domain/block-time'

export const BLOCKS_KEY = ['blocks'] as const

export function useBlockTime() {
  const persistence = usePersistence()

  return useQuery({ key: BLOCKS_KEY, query: () => persistence.blocks.all() })
}

/**
 * Saves a block only if it does not collide with the ones already stored.
 *
 * The check runs here rather than in the component because it needs the current stored set,
 * and because a rule this load bearing should not depend on a screen remembering to ask.
 * addBlock throws BlockTimeOverlapError, which the caller surfaces.
 */
export function useSaveBlockTime() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: async (block: BlockTime) => {
      const existing = await persistence.blocks.all()

      addBlock(existing, block)

      return persistence.blocks.save(block)
    },
    onSettled: () => cache.invalidateQueries({ key: BLOCKS_KEY }, true),
  })
}

export function useRemoveBlockTime() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (id: Identifier) => persistence.blocks.remove(id),
    onSettled: () => cache.invalidateQueries({ key: BLOCKS_KEY }, true),
  })
}
