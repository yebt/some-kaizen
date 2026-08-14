import type { Repository } from '@shared/domain/repository'

import type { Habit } from './habit'
import type { Routine } from './routine'
import type { HabitEntry } from './habit-entry'

/** Storage port for habit definitions. */
export type HabitRepository = Repository<Habit>

/** Storage port for the log of what actually happened. */
export type HabitEntryRepository = Repository<HabitEntry>

export type RoutineRepository = Repository<Routine>
