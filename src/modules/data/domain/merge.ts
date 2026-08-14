import type { Identifier } from '@shared/domain/identifier'
import type { Entity } from '@shared/domain/repository'
import { type BlockTime, findConflicts } from '@modules/block-time/domain/block-time'
import type { HabitEntry } from '@modules/habits/domain/habit-entry'

import type { Dataset } from './dataset'

/** Something the merge could not decide on its own, reported rather than resolved silently. */
export interface MergeCollision {
  readonly kind: 'habit' | 'occurrence' | 'block' | 'overlap' | 'routine'
  readonly id: Identifier
  readonly label: string
  readonly detail: string
}

export interface MergeReport {
  readonly dataset: Dataset
  readonly added: {
    habits: number
    entries: number
    instances: number
    blocks: number
    routines: number
  }
  /** Entries the incoming file answered more recently than this device had. */
  readonly superseded: number
  readonly collisions: MergeCollision[]
}

/**
 * Compares two records by value, whatever order their keys happen to be in.
 *
 * Key order is not part of what a record means, and two devices building the same habit
 * through the same constructor can still serialise it differently once optional fields come
 * and go. Comparing raw JSON would report those as conflicts and bury the real ones.
 */
function sameValue(left: unknown, right: unknown): boolean {
  return canonical(left) === canonical(right)
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined'

  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`

  const entries = Object.entries(value as Record<string, unknown>)
    // Undefined and absent mean the same thing here, and only one of them survives JSON.
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))

  return `{${entries.map(([key, item]) => `${key}:${canonical(item)}`).join(',')}}`
}

/**
 * Merges a collection by identity, keeping what is already here when the two disagree.
 *
 * There is nothing in a backup file that says which copy is newer — timestamps are storage
 * metadata and do not travel in it — so a genuine disagreement cannot be resolved by the
 * merge, only reported. Keeping the local copy is the safe half of that: the device you are
 * standing at is the one whose state you can still see and correct.
 */
function mergeEntities<T extends Entity>(
  mine: readonly T[],
  theirs: readonly T[],
  describe: (entity: T) => MergeCollision,
): { merged: T[]; added: T[]; collisions: MergeCollision[] } {
  const byId = new Map(mine.map((entity) => [entity.id, entity]))
  const added: T[] = []
  const collisions: MergeCollision[] = []

  for (const incoming of theirs) {
    const existing = byId.get(incoming.id)

    if (!existing) {
      byId.set(incoming.id, incoming)
      added.push(incoming)

      continue
    }

    if (!sameValue(existing, incoming)) collisions.push(describe(existing))
  }

  return { merged: [...byId.values()], added, collisions }
}

/**
 * Entries resolve themselves, because the domain already has a rule for them.
 *
 * `currentEntries` decides which verdict stands by `recordedAt`, and that field does travel
 * in a backup. Applying the same rule here means an imported correction wins exactly when
 * the app would have considered it the current answer, rather than the merge inventing a
 * second opinion.
 */
function mergeEntries(
  mine: readonly HabitEntry[],
  theirs: readonly HabitEntry[],
): { merged: HabitEntry[]; added: HabitEntry[]; superseded: number } {
  const byId = new Map(mine.map((entry) => [entry.id, entry]))
  const added: HabitEntry[] = []
  let superseded = 0

  for (const incoming of theirs) {
    const existing = byId.get(incoming.id)

    if (!existing) {
      byId.set(incoming.id, incoming)
      added.push(incoming)

      continue
    }

    if (incoming.recordedAt > existing.recordedAt) {
      byId.set(incoming.id, incoming)
      superseded += 1
    }
  }

  return { merged: [...byId.values()], added, superseded }
}

/**
 * Folds an imported backup into what is already stored.
 *
 * Merging rather than replacing, because a backup is usually the other half of your data
 * rather than a correction of it: importing the file from your phone onto your laptop should
 * bring what the laptop is missing, not delete everything the laptop knows.
 *
 * Nothing is ever removed. A record absent from the file means the file is older or came
 * from elsewhere, not that the record was deleted — a backup carries no tombstones, so it
 * cannot tell the difference and must not guess.
 */
export function mergeDataset(mine: Dataset, theirs: Dataset): MergeReport {
  const habits = mergeEntities(mine.habits, theirs.habits, (habit) => ({
    kind: 'habit',
    id: habit.id,
    label: habit.name,
    detail: 'The file has a different version of this habit. Yours was kept.',
  }))

  const instances = mergeEntities(mine.instances, theirs.instances, (instance) => ({
    kind: 'occurrence',
    id: instance.id,
    label: instance.date,
    detail: 'The file places this occurrence differently. Yours was kept.',
  }))

  const blocks = mergeEntities(mine.blocks, theirs.blocks, (block) => ({
    kind: 'block',
    id: block.id,
    label: block.name,
    detail: 'The file has different hours for this block. Yours were kept.',
  }))

  const routines = mergeEntities(mine.routines, theirs.routines, (routine) => ({
    kind: 'routine',
    id: routine.id,
    label: routine.name,
    detail: 'The file arranges this part of the day differently. Yours was kept.',
  }))

  const entries = mergeEntries(mine.entries, theirs.entries)

  return {
    dataset: {
      habits: habits.merged,
      entries: entries.merged,
      instances: instances.merged,
      blocks: blocks.merged,
      routines: routines.merged,
    },
    added: {
      habits: habits.added.length,
      entries: entries.added.length,
      instances: instances.added.length,
      blocks: blocks.added.length,
      routines: routines.added.length,
    },
    superseded: entries.superseded,
    collisions: [
      ...habits.collisions,
      ...instances.collisions,
      ...blocks.collisions,
      ...routines.collisions,
      ...overlappingBlocks(blocks.merged),
    ],
  }
}

/**
 * Blocks that only collide once both sides are present.
 *
 * Each device added something that overlapped nothing it could see, so neither ever went
 * through the check that would have refused it. The merge accepts both and says so:
 * refusing data at import time is how an import loses data, and silently dropping one would
 * delete something the user typed to satisfy an invariant they never broke.
 */
function overlappingBlocks(blocks: readonly BlockTime[]): MergeCollision[] {
  const reported = new Set<string>()
  const collisions: MergeCollision[] = []

  for (const block of blocks) {
    for (const other of findConflicts(block, blocks)) {
      const pair = [block.id, other.id].sort().join(':')

      if (reported.has(pair)) continue

      reported.add(pair)
      collisions.push({
        kind: 'overlap',
        id: block.id,
        label: `${block.name} and ${other.name}`,
        detail: 'These now overlap. Both were kept, so edit one when you get a chance.',
      })
    }
  }

  return collisions
}
