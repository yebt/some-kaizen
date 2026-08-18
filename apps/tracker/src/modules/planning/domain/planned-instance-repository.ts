import type { Repository } from '@shared/domain/repository'

import type { PlannedInstance } from './planned-instance'

/** Storage port for occurrences placed on the calendar. */
export type PlannedInstanceRepository = Repository<PlannedInstance>
