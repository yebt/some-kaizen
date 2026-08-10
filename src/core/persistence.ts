import { createCollection } from '@shared/infrastructure/idb/collection'
import { openDatabase, STORE } from '@shared/infrastructure/idb/database'
import { createIdbRepository } from '@shared/infrastructure/idb/idb-repository'
import type { Habit } from '@modules/habits/domain/habit'
import type { HabitEntry } from '@modules/habits/domain/habit-entry'
import type { HabitEntryRepository, HabitRepository } from '@modules/habits/domain/habit-repository'
import type { PlannedInstance } from '@modules/planning/domain/planned-instance'
import type { PlannedInstanceRepository } from '@modules/planning/domain/planned-instance-repository'
import type { BlockTime } from '@modules/block-time/domain/block-time'
import type { BlockTimeRepository } from '@modules/block-time/domain/block-time-repository'

/**
 * Every storage port the app needs, resolved once.
 *
 * This is the composition root: the single place that knows both the ports and the
 * IndexedDB adapter behind them. Nothing else imports from infrastructure, so swapping in a
 * synced adapter later is a change to this file alone.
 */
export interface Persistence {
  readonly habits: HabitRepository
  readonly entries: HabitEntryRepository
  readonly instances: PlannedInstanceRepository
  readonly blocks: BlockTimeRepository
}

export async function createPersistence(databaseName?: string): Promise<Persistence> {
  const database = await openDatabase(databaseName)

  return {
    habits: createIdbRepository(createCollection<Habit>(database, STORE.habits)),
    entries: createIdbRepository(createCollection<HabitEntry>(database, STORE.entries)),
    instances: createIdbRepository(createCollection<PlannedInstance>(database, STORE.instances)),
    blocks: createIdbRepository(createCollection<BlockTime>(database, STORE.blocks)),
  }
}
