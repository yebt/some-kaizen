import type { Repository } from '@shared/domain/repository'

import type { Challenge, ChallengeDay } from './challenge'

/**
 * Where challenges are kept, as a port the domain owns.
 *
 * Two stores rather than one, for the same reason habits and their entries are apart: a
 * programme is written once and read constantly, while its days are written every time a box
 * is ticked. Putting them together would rewrite the whole programme on every tick.
 */
export type ChallengeRepository = Repository<Challenge>
export type ChallengeDayRepository = Repository<ChallengeDay>
