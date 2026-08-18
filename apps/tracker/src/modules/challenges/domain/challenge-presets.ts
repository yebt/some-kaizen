import type { CalendarDate } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'

import { type Challenge, createChallenge, type MissRule } from './challenge'

/**
 * The programmes that ship with the app.
 *
 * Bundled for the same reason the routine presets are — a library needing a connection is a
 * library that, on a phone, is not there — and small for a different one: a programme is a
 * commitment, and a menu of thirty is a way of avoiding making one.
 */
export interface ChallengePreset {
  readonly key: string
  readonly name: string
  /** One line on what it asks, which is what somebody decides against. */
  readonly summary: string
  readonly lengthDays: number
  readonly onMiss: MissRule
  readonly tasks: readonly string[]
}

export const CHALLENGE_PRESETS: readonly ChallengePreset[] = [
  {
    key: '75-hard',
    name: '75 Hard',
    summary: 'Seventy-five days, five things a day, and one miss puts you back at day one.',
    lengthDays: 75,
    onMiss: 'restart',
    tasks: [
      'Two workouts, one outdoors',
      'Follow a diet, no alcohol',
      'Drink four litres of water',
      'Read ten pages of non-fiction',
      'Take a progress photo',
    ],
  },
  {
    key: '30-day-reset',
    name: 'The 30 day reset',
    // Forgiving on purpose: a fixed daily set is a useful shape without the punishment, and
    // it is the honest thing to offer beside a programme that has none.
    summary: 'Thirty days of four small things. A missed day is a missed day, not a reset.',
    lengthDays: 30,
    onMiss: 'continue',
    tasks: ['Move for twenty minutes', 'Read ten pages', 'Drink two litres', 'Get outside'],
  },
]

export interface ChallengeMint {
  readonly id: Identifier
  readonly newTaskId: () => Identifier
  readonly startedOn: CalendarDate
}

/**
 * Builds a challenge from a preset.
 *
 * Every task gets a fresh identifier rather than one baked into the preset. Two people
 * starting 75 Hard, or one person starting it twice, must not end up sharing task ids — a
 * day recorded against one attempt would then satisfy the other, and ticking one programme
 * would silently complete another.
 */
export function challengeFromPreset(preset: ChallengePreset, mint: ChallengeMint): Challenge {
  return createChallenge({
    id: mint.id,
    name: preset.name,
    lengthDays: preset.lengthDays,
    tasks: preset.tasks.map((name) => ({ id: mint.newTaskId(), name })),
    startedOn: mint.startedOn,
    onMiss: preset.onMiss,
  })
}
