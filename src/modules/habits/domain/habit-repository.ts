import type { Repository } from '@shared/domain/repository'

import type { Habit } from './habit'
import type { HabitEntry } from './habit-entry'

/** Storage port for habit definitions. */
export type HabitRepository = Repository<Habit>

/** Storage port for the log of what actually happened. */
export type HabitEntryRepository = Repository<HabitEntry>
