import type { Identifier } from '@shared/domain/identifier'
import type { Entity, Repository } from '@shared/domain/repository'

import type { Collection } from './collection'

/**
 * Adapts an object store to the domain's repository port.
 *
 * Deliberately thin: it only maps identity onto the storage key. All the storage behaviour
 * that could actually be wrong — durability, tombstones, timestamps — lives in the
 * collection and is tested there, so this layer has nothing left to hide a bug in.
 */
export function createIdbRepository<T extends Entity>(collection: Collection<T>): Repository<T> {
  return {
    all: () => collection.all(),
    find: (id: Identifier) => collection.get(id),
    save: (entity: T) => collection.put(entity.id, entity),
    saveAll: (entities) =>
      collection.putMany(entities.map((entity) => ({ id: entity.id, value: entity }))),
    remove: (id: Identifier) => collection.remove(id),
    async replaceAll(entities) {
      // Cleared rather than merged: an import is a replacement, and leaving tombstones or
      // stale rows behind would quietly mix two datasets together.
      await collection.clear()
      await collection.putMany(entities.map((entity) => ({ id: entity.id, value: entity })))
    },
  }
}
