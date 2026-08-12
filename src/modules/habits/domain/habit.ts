import type { Appearance } from '@shared/domain/appearance'
import { type CalendarDate, isAfter, isBefore } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'

/**
 * Whether the habit is something to build or something to quit.
 *
 * The two are not mirror images and must not share a shape. A positive habit is planned in
 * advance and performed; a negative habit is never planned at all, because you do not
 * schedule the thing you are trying to stop doing. It is judged after the fact, the
 * following day, which is the only moment the answer is actually known.
 */
export type HabitPolarity = 'positive' | 'negative'

/**
 * How a positive habit is judged.
 *
 * `completed` is binary: you meditated or you did not. `measured` carries a quantity, and
 * with it the idea of a partial day, which is what stops a rigid tracker from reading a
 * mostly good day as a failure.
 */
export type PositiveTracking = 'completed' | 'measured'

export type FrequencyPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** How often a positive habit recurs: a period, and how many times inside it. */
export interface Frequency {
  readonly period: FrequencyPeriod
  readonly repetitions: number
}

/** The quantities that turn a measured habit into a partial day or a finished one. */
export interface Measure {
  readonly unit: string
  readonly minimum: number
  readonly goal: number
}

/** How a measured or completed positive habit ended up on a given day. */
export type PositiveOutcome = 'done' | 'partial' | 'missed'

/** How a negative habit ended up on a given day, answered the following morning. */
export type NegativeOutcome = 'avoided' | 'relapsed'

interface HabitCore extends Appearance {
  readonly id: Identifier
  readonly name: string
  readonly createdOn: CalendarDate
  /** The day the habit was retired. History before it is kept, so statistics stay honest. */
  readonly archivedOn?: CalendarDate
}

export interface CompletedHabit extends HabitCore {
  readonly polarity: 'positive'
  readonly tracking: 'completed'
  readonly frequency: Frequency
}

export interface MeasuredHabit extends HabitCore {
  readonly polarity: 'positive'
  readonly tracking: 'measured'
  readonly frequency: Frequency
  readonly measure: Measure
}

export type PositiveHabit = CompletedHabit | MeasuredHabit

export interface NegativeHabit extends HabitCore {
  readonly polarity: 'negative'
}

export type Habit = PositiveHabit | NegativeHabit

export const MAX_HABIT_NAME_LENGTH = 80

export class InvalidHabitNameError extends Error {
  constructor(readonly value: string) {
    super(`A habit name must be between 1 and ${MAX_HABIT_NAME_LENGTH} characters.`)
    this.name = 'InvalidHabitNameError'
  }
}

export class InvalidFrequencyError extends Error {
  constructor(readonly repetitions: number) {
    super(`A frequency must repeat a whole number of times, at least once, per period.`)
    this.name = 'InvalidFrequencyError'
  }
}

export class InvalidMeasureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidMeasureError'
  }
}

/**
 * Builds a recurrence such as twice a week.
 *
 * More repetitions than there are days in the period is allowed on purpose: two gym
 * sessions can share a Saturday, and the planner lets instances overlap.
 */
export function frequency(period: FrequencyPeriod, repetitions: number): Frequency {
  if (!Number.isSafeInteger(repetitions) || repetitions < 1) {
    throw new InvalidFrequencyError(repetitions)
  }

  return { period, repetitions }
}

export function timesPerPeriod(value: Frequency): number {
  return value.repetitions
}

export function measure(unit: string, minimum: number, goal: number): Measure {
  const trimmedUnit = unit.trim()

  if (!trimmedUnit) throw new InvalidMeasureError('A measured habit needs a unit.')

  if (!Number.isFinite(minimum) || minimum <= 0) {
    throw new InvalidMeasureError(`A minimum must be a positive number, received ${minimum}.`)
  }

  if (!Number.isFinite(goal) || goal < minimum) {
    throw new InvalidMeasureError(
      `A goal must be a number at or above the minimum ${minimum}, received ${goal}.`,
    )
  }

  return { unit: trimmedUnit, minimum, goal }
}

/**
 * Grades a recorded quantity against the habit's own thresholds.
 *
 * Reaching the minimum counts as partial rather than missed, which is the whole reason the
 * minimum exists: a day where you drank most of your water is not the same as a day where
 * you drank none, and collapsing the two teaches you nothing.
 */
export function outcomeFor(value: Measure, recorded: number): PositiveOutcome {
  if (!Number.isFinite(recorded) || recorded < 0) {
    throw new InvalidMeasureError(`A recorded value must be zero or a positive number.`)
  }

  if (recorded >= value.goal) return 'done'
  if (recorded >= value.minimum) return 'partial'

  return 'missed'
}

/**
 * How far a recorded amount got, in the terms the habit itself defines.
 *
 * Finer than the three outcomes because a list has room to say more than pass or fail.
 * "Just under the minimum" and "nothing at all" both grade as missed, yet one of them is
 * almost a good day, and a tracker that cannot tell you which is throwing away the only
 * information that would keep you going.
 */
export type Achievement = 'none' | 'below' | 'minimum' | 'above' | 'goal' | 'over'

export function achievementFor(value: Measure, recorded: number): Achievement {
  if (!Number.isFinite(recorded) || recorded < 0) {
    throw new InvalidMeasureError('A recorded value must be zero or a positive number.')
  }

  if (recorded === 0) return 'none'
  // Checked before the minimum so a habit whose minimum equals its goal reports the goal,
  // which is the better thing to tell someone who just reached both at once.
  if (recorded > value.goal) return 'over'
  if (recorded >= value.goal) return 'goal'
  if (recorded > value.minimum) return 'above'
  if (recorded >= value.minimum) return 'minimum'

  return 'below'
}

export interface CompletedHabitDraft extends Appearance {
  readonly id: Identifier
  readonly name: string
  readonly frequency: Frequency
  readonly createdOn: CalendarDate
  /** Kept when editing, so re-saving a retired habit does not quietly revive it. */
  readonly archivedOn?: CalendarDate
}

export interface MeasuredHabitDraft extends CompletedHabitDraft {
  readonly measure: Measure
}

export interface NegativeHabitDraft extends Appearance {
  readonly id: Identifier
  readonly name: string
  readonly createdOn: CalendarDate
  readonly archivedOn?: CalendarDate
}

export function createCompletedHabit(draft: CompletedHabitDraft): CompletedHabit {
  return {
    ...appearanceOf(draft),
    id: draft.id,
    name: habitName(draft.name),
    createdOn: draft.createdOn,
    ...(draft.archivedOn ? { archivedOn: draft.archivedOn } : {}),
    polarity: 'positive',
    tracking: 'completed',
    frequency: draft.frequency,
  }
}

export function createMeasuredHabit(draft: MeasuredHabitDraft): MeasuredHabit {
  return {
    ...appearanceOf(draft),
    id: draft.id,
    name: habitName(draft.name),
    createdOn: draft.createdOn,
    ...(draft.archivedOn ? { archivedOn: draft.archivedOn } : {}),
    polarity: 'positive',
    tracking: 'measured',
    frequency: draft.frequency,
    measure: draft.measure,
  }
}

export function createNegativeHabit(draft: NegativeHabitDraft): NegativeHabit {
  return {
    ...appearanceOf(draft),
    id: draft.id,
    name: habitName(draft.name),
    createdOn: draft.createdOn,
    ...(draft.archivedOn ? { archivedOn: draft.archivedOn } : {}),
    polarity: 'negative',
  }
}

/**
 * Retires a habit without deleting it.
 *
 * Deleting would rewrite the past: the streaks and relapses already recorded against it
 * happened, and the statistics should keep saying so.
 */
export function archiveHabit<T extends Habit>(habit: T, on: CalendarDate): T {
  if (isBefore(on, habit.createdOn)) {
    throw new RangeError(`Cannot archive a habit on ${on}, before it was created.`)
  }

  return { ...habit, archivedOn: on }
}

/** Whether the habit should appear in planning and statistics for the given day. */
export function isActiveOn(habit: Habit, date: CalendarDate): boolean {
  if (isBefore(date, habit.createdOn)) return false

  // The archive day itself was lived under the habit, so it still counts.
  return !habit.archivedOn || !isAfter(date, habit.archivedOn)
}

export function isPositive(habit: Habit): habit is PositiveHabit {
  return habit.polarity === 'positive'
}

export function isNegative(habit: Habit): habit is NegativeHabit {
  return habit.polarity === 'negative'
}

export function isMeasured(habit: Habit): habit is MeasuredHabit {
  return habit.polarity === 'positive' && habit.tracking === 'measured'
}

/** Only the parts that were actually chosen, so an unstyled habit stores no empty fields. */
function appearanceOf(draft: Appearance): Appearance {
  return {
    ...(draft.colour ? { colour: draft.colour } : {}),
    ...(draft.pattern ? { pattern: draft.pattern } : {}),
  }
}

function habitName(value: string): string {
  const trimmed = value.trim()

  if (!trimmed || trimmed.length > MAX_HABIT_NAME_LENGTH) throw new InvalidHabitNameError(value)

  return trimmed
}
