import { describe, expect, it } from 'vitest'

import { addDays, calendarDate } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'

import {
  abandonChallenge,
  type Challenge,
  type ChallengeDay,
  createChallenge,
  InvalidChallengeError,
  isChallengeActiveOn,
  isDayComplete,
  MAX_CHALLENGE_LENGTH_DAYS,
  MAX_CHALLENGE_TASKS,
  type MissRule,
  progressOf,
} from './challenge'

const START = calendarDate('2026-03-01')

function task(name: string): { id: Identifier; name: string } {
  return { id: newIdentifier(), name }
}

function challengeOf(
  options: { lengthDays?: number; onMiss?: MissRule; tasks?: ReturnType<typeof task>[] } = {},
): Challenge {
  return createChallenge({
    id: newIdentifier(),
    name: '75 Hard',
    lengthDays: options.lengthDays ?? 3,
    tasks: options.tasks ?? [task('Two workouts'), task('Read ten pages')],
    startedOn: START,
    onMiss: options.onMiss ?? 'restart',
  })
}

/** A day on which the listed tasks were ticked. */
function dayOf(challenge: Challenge, offset: number, done: 'all' | 'some' | 'none'): ChallengeDay {
  const completed =
    done === 'all'
      ? challenge.tasks.map((one) => one.id)
      : done === 'some'
        ? challenge.tasks.slice(0, 1).map((one) => one.id)
        : []

  return {
    id: newIdentifier(),
    challengeId: challenge.id,
    date: addDays(START, offset),
    completed,
    recordedAt: offset,
  }
}

describe('building a challenge', () => {
  it('keeps the tasks in the order they were given', () => {
    const challenge = challengeOf({ tasks: [task('One'), task('Two'), task('Three')] })

    expect(challenge.tasks.map((one) => one.name)).toEqual(['One', 'Two', 'Three'])
  })

  it('refuses one with nothing to do, which has nothing to fail at', () => {
    expect(() => challengeOf({ tasks: [] })).toThrow(InvalidChallengeError)
  })

  it('refuses one that is over before it starts', () => {
    expect(() => challengeOf({ lengthDays: 0 })).toThrow(InvalidChallengeError)
  })

  it('refuses one longer than a year', () => {
    expect(() => challengeOf({ lengthDays: MAX_CHALLENGE_LENGTH_DAYS + 1 })).toThrow(
      InvalidChallengeError,
    )
  })

  it('refuses more things a day than anyone would tick', () => {
    const many = Array.from({ length: MAX_CHALLENGE_TASKS + 1 }, (_, index) => task(`T${index}`))

    expect(() => challengeOf({ tasks: many })).toThrow(InvalidChallengeError)
  })

  it('refuses the same task twice, which no day could half satisfy', () => {
    const repeated = task('Two workouts')

    expect(() => challengeOf({ tasks: [repeated, repeated] })).toThrow(InvalidChallengeError)
  })

  it('refuses a task with no name', () => {
    expect(() => challengeOf({ tasks: [task('  ')] })).toThrow(InvalidChallengeError)
  })
})

describe('whether a day counted', () => {
  it('counts a day where every task was ticked', () => {
    const challenge = challengeOf()

    expect(isDayComplete(challenge, dayOf(challenge, 0, 'all'))).toBe(true)
  })

  it('does not count a day where some were, because it is all or nothing', () => {
    // Three of four is not three quarters of a day here. A programme whose days could be
    // partly done would be a habit with extra steps.
    const challenge = challengeOf()

    expect(isDayComplete(challenge, dayOf(challenge, 0, 'some'))).toBe(false)
  })

  it('does not count a day nobody recorded', () => {
    expect(isDayComplete(challengeOf(), undefined)).toBe(false)
  })

  it('stops counting an old day once the challenge asks for more', () => {
    // Completeness is derived rather than stored, so adding a task cannot leave old days
    // claiming a completeness they never had.
    const challenge = challengeOf()
    const day = dayOf(challenge, 0, 'all')
    const harder = { ...challenge, tasks: [...challenge.tasks, task('Cold shower')] }

    expect(isDayComplete(harder, day)).toBe(false)
  })
})

describe('how far through the programme today is', () => {
  it('counts nothing before it begins', () => {
    const challenge = challengeOf()

    expect(progressOf(challenge, [], addDays(START, -1))).toMatchObject({
      completed: 0,
      dayNumber: 0,
    })
  })

  it('is on day one on the first day, before anything is ticked', () => {
    const challenge = challengeOf()

    expect(progressOf(challenge, [], START)).toMatchObject({ completed: 0, dayNumber: 1 })
  })

  it('counts a finished day and stays on it', () => {
    // You have done day one; day two is tomorrow.
    const challenge = challengeOf()

    expect(progressOf(challenge, [dayOf(challenge, 0, 'all')], START)).toMatchObject({
      completed: 1,
      dayNumber: 1,
      todayComplete: true,
    })
  })

  it('moves to the next day once the last one is behind it', () => {
    const challenge = challengeOf()

    expect(progressOf(challenge, [dayOf(challenge, 0, 'all')], addDays(START, 1))).toMatchObject({
      completed: 1,
      dayNumber: 2,
      todayComplete: false,
    })
  })

  it('never counts today as a miss, however little has been ticked', () => {
    /*
     * The number would otherwise collapse to zero every morning and climb back by evening,
     * which is not a measurement, it is a mood.
     */
    const challenge = challengeOf()
    const days = [dayOf(challenge, 0, 'all'), dayOf(challenge, 1, 'none')]

    expect(progressOf(challenge, days, addDays(START, 1))).toMatchObject({
      completed: 1,
      restarts: 0,
    })
  })

  it('says how many days are left', () => {
    const challenge = challengeOf({ lengthDays: 3 })

    expect(progressOf(challenge, [dayOf(challenge, 0, 'all')], START).remaining).toBe(2)
  })
})

describe('the rule the whole module exists for', () => {
  it('sends a missed day back to the beginning', () => {
    // Miss one and the days before it no longer count towards finishing. That is what the
    // programme means, and it is the opposite of everything else in this app.
    const challenge = challengeOf({ lengthDays: 5 })
    const days = [
      dayOf(challenge, 0, 'all'),
      dayOf(challenge, 1, 'all'),
      dayOf(challenge, 2, 'none'),
      dayOf(challenge, 3, 'all'),
    ]

    expect(progressOf(challenge, days, addDays(START, 3))).toMatchObject({
      completed: 1,
      restarts: 1,
    })
  })

  it('counts every restart, so the attempt is not rewritten as a clean one', () => {
    const challenge = challengeOf({ lengthDays: 5 })
    const days = [
      dayOf(challenge, 0, 'all'),
      dayOf(challenge, 1, 'none'),
      dayOf(challenge, 2, 'all'),
      dayOf(challenge, 3, 'none'),
      dayOf(challenge, 4, 'all'),
    ]

    expect(progressOf(challenge, days, addDays(START, 4)).restarts).toBe(2)
  })

  it('does not restart before anything was standing', () => {
    // Missing the very first day loses nothing, so calling it a restart would be counting a
    // failure that cost nothing.
    const challenge = challengeOf({ lengthDays: 5 })
    const days = [dayOf(challenge, 0, 'none'), dayOf(challenge, 1, 'all')]

    expect(progressOf(challenge, days, addDays(START, 1)).restarts).toBe(0)
  })

  it('says where the run that is standing began', () => {
    const challenge = challengeOf({ lengthDays: 5 })
    const days = [
      dayOf(challenge, 0, 'all'),
      dayOf(challenge, 1, 'none'),
      dayOf(challenge, 2, 'all'),
      dayOf(challenge, 3, 'all'),
    ]

    expect(progressOf(challenge, days, addDays(START, 3)).runStartedOn).toBe(addDays(START, 2))
  })

  it('leaves the run standing when the programme forgives a miss', () => {
    // A fixed daily set is a useful shape without the punishment, and forcing every one to be
    // all-or-nothing forever would be the app taking a side it need not take.
    const challenge = challengeOf({ lengthDays: 5, onMiss: 'continue' })
    const days = [
      dayOf(challenge, 0, 'all'),
      dayOf(challenge, 1, 'none'),
      dayOf(challenge, 2, 'all'),
    ]

    expect(progressOf(challenge, days, addDays(START, 2))).toMatchObject({
      completed: 2,
      restarts: 0,
    })
  })
})

describe('finishing', () => {
  it('is finished once the run reaches the length', () => {
    const challenge = challengeOf({ lengthDays: 2 })
    const days = [dayOf(challenge, 0, 'all'), dayOf(challenge, 1, 'all')]

    expect(progressOf(challenge, days, addDays(START, 1))).toMatchObject({
      finished: true,
      remaining: 0,
      dayNumber: 2,
    })
  })

  it('stays finished on the days afterwards, rather than restarting on the first blank one', () => {
    // A programme you completed is not one you are failing the next morning. Asserted on the
    // count as well as the flag: a walk that carried on past the finish would leave the flag
    // standing and quietly reset the days behind it to zero.
    const challenge = challengeOf({ lengthDays: 2 })
    const days = [dayOf(challenge, 0, 'all'), dayOf(challenge, 1, 'all')]
    const progress = progressOf(challenge, days, addDays(START, 9))

    expect(progress.finished).toBe(true)
    expect(progress.completed).toBe(2)
    expect(progress.remaining).toBe(0)
  })
})

describe('giving up on one', () => {
  it('keeps what was done rather than deleting it', () => {
    const challenge = abandonChallenge(challengeOf({ lengthDays: 5 }), addDays(START, 2))
    const days = [dayOf(challenge, 0, 'all'), dayOf(challenge, 1, 'all')]

    expect(progressOf(challenge, days, addDays(START, 9)).completed).toBe(2)
  })

  it('stops counting the days after it was given up on', () => {
    const challenge = abandonChallenge(challengeOf({ lengthDays: 5 }), addDays(START, 1))
    const days = [dayOf(challenge, 0, 'all'), dayOf(challenge, 1, 'all')]

    expect(progressOf(challenge, days, addDays(START, 9)).restarts).toBe(0)
  })

  it('is no longer something today should ask about', () => {
    const challenge = abandonChallenge(challengeOf(), addDays(START, 1))

    expect(isChallengeActiveOn(challenge, addDays(START, 1))).toBe(true)
    expect(isChallengeActiveOn(challenge, addDays(START, 2))).toBe(false)
  })

  it('is not something to ask about before it starts either', () => {
    expect(isChallengeActiveOn(challengeOf(), addDays(START, -1))).toBe(false)
  })
})

describe('days belonging to another challenge', () => {
  it('are ignored even when the two ask for the same things', () => {
    /*
     * Two programmes at once is a thing people do, and the dangerous version is the one where
     * they share task identifiers — which is exactly what a preset handing out fixed ids
     * would produce. Without a filter the other programme's day satisfies this one, and
     * ticking one challenge silently completes the other.
     */
    const shared = [task('Two workouts'), task('Read ten pages')]
    const challenge = challengeOf({ tasks: shared })
    const other = challengeOf({ tasks: shared })

    expect(progressOf(challenge, [dayOf(other, 0, 'all')], START).completed).toBe(0)
  })
})
