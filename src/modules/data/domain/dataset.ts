import type { Habit } from '@modules/habits/domain/habit'
import type { HabitEntry } from '@modules/habits/domain/habit-entry'
import type { Routine } from '@modules/habits/domain/routine'
import type { PlannedInstance } from '@modules/planning/domain/planned-instance'
import type { BlockTime } from '@modules/block-time/domain/block-time'

/**
 * Everything the app stores, as one value.
 *
 * This is the unit of import, export and demo seeding, which is why it is a single shape
 * rather than four loose lists: a partial restore would leave occurrences pointing at
 * habits that no longer exist.
 */
export interface Dataset {
  readonly habits: readonly Habit[]
  readonly entries: readonly HabitEntry[]
  readonly instances: readonly PlannedInstance[]
  readonly blocks: readonly BlockTime[]
  readonly routines: readonly Routine[]
}

export const EMPTY_DATASET: Dataset = {
  habits: [],
  entries: [],
  instances: [],
  blocks: [],
  routines: [],
}
