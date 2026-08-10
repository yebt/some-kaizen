import type { Repository } from '@shared/domain/repository'

import type { BlockTime } from './block-time'

/** Storage port for the fixed, non-overlapping commitments of the week. */
export type BlockTimeRepository = Repository<BlockTime>
