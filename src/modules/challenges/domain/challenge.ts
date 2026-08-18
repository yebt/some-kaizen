import { type CalendarDate, eachDayBetween, isAfter, isBefore } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'

/**
 * A programme with a fixed length, a fixed daily set, and all-or-nothing days.
 *
 * Modelled outside the habit model on purpose, and this is the whole reason the module
 * exists rather than a flag on `Habit`.
 *
 * Everything the rest of this app believes about days is that they accumulate. A streak is a
 * measurement of what happened; a missed day is one bad day among the good ones, and the
 * good ones keep their value. A programme like 75 Hard believes the opposite: miss one day
 * and the seventy-four before it are worth nothing, you are back at day one. That is not a
 * harsher version of a habit, it is a contradiction of one — and putting it inside the habit
 * model would mean every function that counts a day having to ask which of two incompatible
 * philosophies applied to it.
 *
 * Kept apart, both ideas stay coherent. A challenge is something you opt into, with its own
 * rules, its own records and its own screen, and the habits underneath are untouched by it.
 */
export interface ChallengeTask {
  readonly id: Identifier
  readonly name: string
}

/**
 * What a missed day costs.
 *
 * `restart` is the 75 Hard rule and the reason this module exists. `continue` is offered
 * because a fixed daily set is a useful shape without the punishment — "thirty days of these
 * four things" is a real programme, and forcing every one of them to be all-or-nothing
 * forever would be this app taking a side it does not need to take.
 */
export type MissRule = 'restart' | 'continue'

export interface Challenge {
  readonly id: Identifier
  readonly name: string
  /** How many completed days finish it. */
  readonly lengthDays: number
  /** Every task, all of which a day needs. The order is the order they are listed in. */
  readonly tasks: readonly ChallengeTask[]
  readonly startedOn: CalendarDate
  readonly onMiss: MissRule
  /** Given up on, rather than deleted, so what was done still happened. */
  readonly abandonedOn?: CalendarDate
}

/**
 * A day of a challenge, and which of its tasks were ticked.
 *
 * The tasks are stored rather than a single "done" flag, because a programme is ticked
 * through the day rather than judged at the end of it: three of four at six in the evening is
 * a real state, and the screen has to be able to show it. Whether the day *counted* is then
 * derived rather than stored, so a task added to the challenge cannot leave old days
 * claiming a completeness they never had.
 */
export interface ChallengeDay {
  readonly id: Identifier
  readonly challengeId: Identifier
  readonly date: CalendarDate
  readonly completed: readonly Identifier[]
  readonly recordedAt: number
}

export const MAX_CHALLENGE_NAME_LENGTH = 60
export const MAX_CHALLENGE_TASKS = 12
export const MAX_CHALLENGE_LENGTH_DAYS = 365

export class InvalidChallengeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidChallengeError'
  }
}

export interface ChallengeDraft {
  readonly id: Identifier
  readonly name: string
  readonly lengthDays: number
  readonly tasks: readonly ChallengeTask[]
  readonly startedOn: CalendarDate
  readonly onMiss: MissRule
  readonly abandonedOn?: CalendarDate
}

/**
 * Builds a challenge, refusing the shapes that cannot mean anything.
 *
 * A programme with no tasks has nothing to fail at, and one of zero days is finished before
 * it starts. Both would render as a screen full of zeroes rather than as an error, which is
 * the worst way to find out you typed something wrong.
 */
export function createChallenge(draft: ChallengeDraft): Challenge {
  const name = draft.name.trim()

  if (!name || name.length > MAX_CHALLENGE_NAME_LENGTH) {
    throw new InvalidChallengeError(
      `A challenge needs a name of at most ${MAX_CHALLENGE_NAME_LENGTH} characters.`,
    )
  }

  if (
    !Number.isSafeInteger(draft.lengthDays) ||
    draft.lengthDays < 1 ||
    draft.lengthDays > MAX_CHALLENGE_LENGTH_DAYS
  ) {
    throw new InvalidChallengeError(
      `A challenge runs for between 1 and ${MAX_CHALLENGE_LENGTH_DAYS} days.`,
    )
  }

  if (draft.tasks.length === 0) {
    throw new InvalidChallengeError('A challenge needs at least one thing to do each day.')
  }

  if (draft.tasks.length > MAX_CHALLENGE_TASKS) {
    throw new InvalidChallengeError(
      `A challenge can ask for at most ${MAX_CHALLENGE_TASKS} things a day.`,
    )
  }

  const seen = new Set<Identifier>()

  for (const task of draft.tasks) {
    if (!task.name.trim()) throw new InvalidChallengeError('Every task needs a name.')
    if (seen.has(task.id)) throw new InvalidChallengeError('A task can appear only once.')

    seen.add(task.id)
  }

  return {
    id: draft.id,
    name,
    lengthDays: draft.lengthDays,
    tasks: draft.tasks.map((task) => ({ id: task.id, name: task.name.trim() })),
    startedOn: draft.startedOn,
    onMiss: draft.onMiss,
    ...(draft.abandonedOn === undefined ? {} : { abandonedOn: draft.abandonedOn }),
  }
}

/** Given up on rather than deleted, so the days already lived still happened. */
export function abandonChallenge(challenge: Challenge, on: CalendarDate): Challenge {
  return { ...challenge, abandonedOn: on }
}

/**
 * Whether a day counted, which is all or nothing.
 *
 * Three of four is not three quarters of a day here. That is the point of the shape: a
 * programme whose days could be partly done would be a habit with extra steps.
 */
export function isDayComplete(challenge: Challenge, day: ChallengeDay | undefined): boolean {
  if (!day) return false

  const done = new Set(day.completed)

  return challenge.tasks.every((task) => done.has(task.id))
}

export interface ChallengeProgress {
  /** Days completed in the run that is currently standing. */
  readonly completed: number
  /** The day of the programme today represents, from 1, or 0 before it begins. */
  readonly dayNumber: number
  readonly remaining: number
  /** Where the run currently standing began, which moves every time one is lost. */
  readonly runStartedOn: CalendarDate
  /** How many times the programme has been started over. */
  readonly restarts: number
  readonly finished: boolean
  readonly todayComplete: boolean
}

/**
 * How far through the programme today is.
 *
 * Two rules do all the work here and both are worth stating.
 *
 * **Today is never a miss.** It is in progress until it is over, exactly as a habit's current
 * period is. Counting it would make the number collapse to zero every morning and climb back
 * by evening, which is not a measurement, it is a mood.
 *
 * **A missed day past resets the run and the next day starts a new one.** That is the rule
 * the whole module exists for. The days before it are not deleted — they happened, and the
 * restart count says how many times this has been true — but they no longer count towards
 * finishing, because that is what the programme means.
 */
export function progressOf(
  challenge: Challenge,
  days: readonly ChallengeDay[],
  today: CalendarDate,
): ChallengeProgress {
  const byDate = new Map(
    days.filter((day) => day.challengeId === challenge.id).map((day) => [day.date, day]),
  )

  const empty: ChallengeProgress = {
    completed: 0,
    dayNumber: 0,
    remaining: challenge.lengthDays,
    runStartedOn: challenge.startedOn,
    restarts: 0,
    finished: false,
    todayComplete: false,
  }

  if (isBefore(today, challenge.startedOn)) return empty

  /*
   * The day that is still open, and therefore never judged.
   *
   * Today, normally. But a challenge given up on stopped being asked about that morning, and
   * the day you stop is not a day you failed — giving up is a decision, not a miss. So the
   * abandoned day is left open in exactly the way today is, and the walk ends there.
   */
  const open =
    challenge.abandonedOn && isBefore(challenge.abandonedOn, today) ? challenge.abandonedOn : today

  let completed = 0
  let restarts = 0
  let runStartedOn = challenge.startedOn
  let finished = false
  let todayComplete = false

  for (const date of eachDayBetween(challenge.startedOn, open)) {
    const complete = isDayComplete(challenge, byDate.get(date))

    if (date === today) todayComplete = complete

    if (complete) {
      if (completed === 0) runStartedOn = date

      completed += 1

      if (completed >= challenge.lengthDays) {
        finished = true
        break
      }

      continue
    }

    // The open day has not failed; it simply has not finished. Everything before it has.
    if (date === open) continue

    if (challenge.onMiss === 'restart' && completed > 0) {
      restarts += 1
      completed = 0
      runStartedOn = challenge.startedOn
    }
  }

  return {
    completed,
    dayNumber: finished
      ? challenge.lengthDays
      : Math.min(completed + (todayComplete ? 0 : 1), challenge.lengthDays),
    remaining: Math.max(challenge.lengthDays - completed, 0),
    runStartedOn,
    restarts,
    finished,
    todayComplete,
  }
}

/** Whether the challenge is one today should still be asking about. */
export function isChallengeActiveOn(challenge: Challenge, date: CalendarDate): boolean {
  if (isBefore(date, challenge.startedOn)) return false

  return challenge.abandonedOn === undefined || !isAfter(date, challenge.abandonedOn)
}
