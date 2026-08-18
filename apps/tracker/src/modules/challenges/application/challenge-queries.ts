import { useMutation, useQuery, useQueryCache } from '@pinia/colada'

import { usePersistence } from '@core/persistence-context'
import type { CalendarDate } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import type { Challenge, ChallengeDay } from '@modules/challenges/domain/challenge'

export const CHALLENGES_KEY = ['challenges'] as const
export const CHALLENGE_DAYS_KEY = ['challenge-days'] as const

export function useChallenges() {
  const persistence = usePersistence()

  return useQuery({ key: CHALLENGES_KEY, query: () => persistence.challenges.all() })
}

export function useChallengeDays() {
  const persistence = usePersistence()

  return useQuery({ key: CHALLENGE_DAYS_KEY, query: () => persistence.challengeDays.all() })
}

export function useSaveChallenge() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (challenge: Challenge) => persistence.challenges.save(challenge),
    onSettled: () => cache.invalidateQueries({ key: CHALLENGES_KEY }, true),
  })
}

/**
 * Removes a programme along with every day recorded against it.
 *
 * Offered beside giving up rather than instead of it. Giving up keeps what was done, which is
 * the honest way to stop; deleting is for a programme started by mistake, and it takes its
 * days with it — an orphaned day is a record nobody can see or remove.
 */
export function useDeleteChallenge() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: async (id: Identifier) => {
      const days = await persistence.challengeDays.all()

      for (const day of days) {
        if (day.challengeId === id) await persistence.challengeDays.remove(day.id)
      }

      await persistence.challenges.remove(id)
    },
    onSettled: async () => {
      for (const key of [CHALLENGES_KEY, CHALLENGE_DAYS_KEY]) {
        await cache.invalidateQueries({ key }, true)
      }
    },
  })
}

export interface TickDraft {
  readonly challengeId: Identifier
  readonly date: CalendarDate
  readonly completed: readonly Identifier[]
  /** The record already standing for that day, when there is one. */
  readonly existing?: ChallengeDay
}

/**
 * Writes what was ticked on a day.
 *
 * One record per day, replaced rather than appended. A habit entry is appended because
 * correcting yesterday's answer is a new verdict that supersedes an old one and the history
 * of having changed your mind is worth keeping. A challenge day is not a verdict, it is a
 * checklist: ticking the fourth box is not a second opinion about the first three.
 */
export function useTickChallengeDay() {
  const persistence = usePersistence()
  const cache = useQueryCache()

  return useMutation({
    mutation: (draft: TickDraft) =>
      persistence.challengeDays.save({
        id: draft.existing?.id ?? newIdentifier(),
        challengeId: draft.challengeId,
        date: draft.date,
        completed: [...draft.completed],
        recordedAt: Date.now(),
      }),
    onSettled: () => cache.invalidateQueries({ key: CHALLENGE_DAYS_KEY }, true),
  })
}
