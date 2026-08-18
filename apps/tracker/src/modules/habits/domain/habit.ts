import type { Appearance } from '@shared/domain/appearance'
import {
  type CalendarDate,
  isAfter,
  isBefore,
  weekday,
  type Weekday,
  weekdaySet,
} from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import { assertDuration, type TimeOfDay } from '@shared/domain/time-of-day'

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
  /**
   * The weekdays it falls on, when the plan names its days instead of counting them.
   *
   * "Three times a week" and "Monday, Wednesday and Friday" are genuinely different plans,
   * not two ways of saying one thing. The first leaves the choice of days open and is what
   * the planner exists to resolve; the second has already made it, and asking someone to
   * drag the same three cards onto the same three days every week would be busywork with no
   * decision in it.
   *
   * Absent rather than a full week when the days are not named, so "unspecified" cannot be
   * confused with "every day".
   */
  readonly weekdays?: readonly Weekday[]
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
  /**
   * A line about why this one is worth doing, when there is one.
   *
   * The name is what a habit is; this is what it is *for*, and the two decay at different
   * rates. "Read" still means what it meant in January; "ten pages a day is fifteen books a
   * year" is the sentence that gets you off the sofa in week three, and it is exactly the
   * sentence nothing in the app could keep — the ideas list said it, you took the idea, and
   * the reason was thrown away on the way in.
   *
   * On every kind, quitting included: "the one that costs you the next morning as well" is
   * a reason in precisely the same way.
   *
   * Absent rather than empty. A habit nobody has explained has no description, which is a
   * different thing from one explained with a blank line.
   */
  readonly description?: string
  readonly createdOn: CalendarDate
  /** The day the habit was retired. History before it is kept, so statistics stay honest. */
  readonly archivedOn?: CalendarDate
}

export interface CompletedHabit extends HabitCore {
  readonly polarity: 'positive'
  readonly tracking: 'completed'
  readonly frequency: Frequency
  /**
   * The hour it usually happens at, when there is one.
   *
   * A habit performed at seven every morning had to be dragged onto seven every morning,
   * because an occurrence carried the only time anyone could state and a new day starts with
   * no occurrence. Saying it once on the habit turns placing it into a correction rather than
   * a chore, and each day's occurrence still owns its own time — moving a card moves that
   * day, never every day after it.
   *
   * Absent rather than midnight when unstated. Midnight is a real answer to "when do you do
   * this", so a default would be the habit claiming an hour nobody chose.
   */
  readonly usualTime?: TimeOfDay
  /**
   * How long it usually takes, when that is known.
   *
   * The same argument as the hour above, one axis over. A routine builder cascades the clock
   * forward through its steps, and it can only do that if each step has a length. Asking for
   * those lengths every time you build a morning would make the fastest way to fill a day the
   * slowest, so the answer is stated once on the habit and reused.
   *
   * Absent rather than the half hour an occurrence defaults to. That default is a sensible
   * size for a card nobody has measured; it is not a claim about how long meditation takes,
   * and storing it as one would put a number in front of someone that they never said.
   */
  readonly usualDurationMinutes?: number
}

export interface MeasuredHabit extends HabitCore {
  readonly polarity: 'positive'
  readonly tracking: 'measured'
  readonly frequency: Frequency
  readonly measure: Measure
  /**
   * The hour it usually happens at, when there is one.
   *
   * A habit performed at seven every morning had to be dragged onto seven every morning,
   * because an occurrence carried the only time anyone could state and a new day starts with
   * no occurrence. Saying it once on the habit turns placing it into a correction rather than
   * a chore, and each day's occurrence still owns its own time — moving a card moves that
   * day, never every day after it.
   *
   * Absent rather than midnight when unstated. Midnight is a real answer to "when do you do
   * this", so a default would be the habit claiming an hour nobody chose.
   */
  readonly usualTime?: TimeOfDay
  /** How long it usually takes, when that is known. See {@link CompletedHabit.usualDurationMinutes}. */
  readonly usualDurationMinutes?: number
}

export type PositiveHabit = CompletedHabit | MeasuredHabit

export interface NegativeHabit extends HabitCore {
  readonly polarity: 'negative'
}

export type Habit = PositiveHabit | NegativeHabit

/**
 * Names compared the way a person compares them: ignoring case and stray spacing.
 *
 * Lives here rather than in whichever feature needed it first, because two now do — importing
 * a routine preset and offering a habit idea both have to answer "is this already tracked",
 * and two spellings of that question would eventually disagree about "  Meditate" and
 * "meditate", leaving a duplicate that nothing afterwards can merge.
 */
export function normalisedName(name: string): string {
  return name.trim().toLowerCase()
}

export const MAX_HABIT_NAME_LENGTH = 80

/**
 * Long enough for a reason, short enough that it stays one.
 *
 * A description that can hold a paragraph becomes a place to keep notes, and notes belong to
 * a day rather than to the habit. This is the sentence under the name, and it has to fit
 * under the name.
 */
export const MAX_HABIT_DESCRIPTION_LENGTH = 140

export class HabitDescriptionTooLongError extends Error {
  constructor(readonly value: string) {
    super(`A habit description can be at most ${MAX_HABIT_DESCRIPTION_LENGTH} characters.`)
    this.name = 'HabitDescriptionTooLongError'
  }
}

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

/**
 * Builds a recurrence that names its days, such as Monday, Wednesday and Friday.
 *
 * The repetition count is derived rather than accepted. It is not independent information —
 * three named days is three times a week — and storing it twice is storing a disagreement
 * waiting to happen.
 */
export function onWeekdays(days: readonly number[]): Frequency {
  const weekdays = weekdaySet(days)

  return { period: 'weekly', repetitions: weekdays.length, weekdays }
}

/** Whether this recurrence names its days rather than counting them. */
export function namesItsDays(value: Frequency): value is Frequency & {
  weekdays: readonly Weekday[]
} {
  return value.weekdays !== undefined && value.weekdays.length > 0
}

/**
 * How many times the habit is owed on a given date without anyone planning it.
 *
 * Zero means the day owes nothing on its own, which is the answer for every recurrence
 * whose landing day is a real decision rather than a given.
 */
export function timesDueOn(value: Frequency, date: CalendarDate): number {
  if (namesItsDays(value)) return value.weekdays.includes(weekday(date)) ? 1 : 0

  // The period is the day itself, so there is nothing left to decide.
  return value.period === 'daily' ? value.repetitions : 0
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
  readonly description?: string
  readonly frequency: Frequency
  readonly createdOn: CalendarDate
  /** Kept when editing, so re-saving a retired habit does not quietly revive it. */
  readonly archivedOn?: CalendarDate
  readonly usualTime?: TimeOfDay
  readonly usualDurationMinutes?: number
}

export interface MeasuredHabitDraft extends CompletedHabitDraft {
  readonly measure: Measure
}

export interface NegativeHabitDraft extends Appearance {
  readonly id: Identifier
  readonly name: string
  readonly description?: string
  readonly createdOn: CalendarDate
  readonly archivedOn?: CalendarDate
}

export function createCompletedHabit(draft: CompletedHabitDraft): CompletedHabit {
  return {
    ...appearanceOf(draft),
    id: draft.id,
    name: habitName(draft.name),
    ...describedAs(draft),
    createdOn: draft.createdOn,
    ...(draft.archivedOn ? { archivedOn: draft.archivedOn } : {}),
    polarity: 'positive',
    tracking: 'completed',
    frequency: draft.frequency,
    ...usualTimeOf(draft),
    ...usualDurationOf(draft),
  }
}

export function createMeasuredHabit(draft: MeasuredHabitDraft): MeasuredHabit {
  return {
    ...appearanceOf(draft),
    id: draft.id,
    name: habitName(draft.name),
    ...describedAs(draft),
    createdOn: draft.createdOn,
    ...(draft.archivedOn ? { archivedOn: draft.archivedOn } : {}),
    polarity: 'positive',
    tracking: 'measured',
    frequency: draft.frequency,
    measure: draft.measure,
    ...usualTimeOf(draft),
    ...usualDurationOf(draft),
  }
}

export function createNegativeHabit(draft: NegativeHabitDraft): NegativeHabit {
  return {
    ...appearanceOf(draft),
    id: draft.id,
    name: habitName(draft.name),
    ...describedAs(draft),
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

/**
 * A trimmed description, or nothing at all.
 *
 * Whitespace alone is not a description, and storing it as one would put an empty line under
 * a name on every screen that shows it. Refused rather than truncated when it is too long:
 * silently cutting somebody's sentence in half is worse than telling them it is too long.
 */
function describedAs(draft: { readonly description?: string }): { description?: string } {
  const trimmed = draft.description?.trim()

  if (!trimmed) return {}

  if (trimmed.length > MAX_HABIT_DESCRIPTION_LENGTH) {
    throw new HabitDescriptionTooLongError(trimmed)
  }

  return { description: trimmed }
}

/** Absent rather than present-and-undefined, so an unstated hour stores nothing at all. */
function usualTimeOf(draft: { readonly usualTime?: TimeOfDay }): { usualTime?: TimeOfDay } {
  return draft.usualTime === undefined ? {} : { usualTime: draft.usualTime }
}

/**
 * The same, for how long it takes, and validated on the way through.
 *
 * A length is checked here rather than trusted because this one reaches storage from a form,
 * a backup file and a preset alike, and a zero or a fraction would only be discovered later
 * by whatever tried to draw a card of that size.
 */
function usualDurationOf(draft: { readonly usualDurationMinutes?: number }): {
  usualDurationMinutes?: number
} {
  return draft.usualDurationMinutes === undefined
    ? {}
    : { usualDurationMinutes: assertDuration(draft.usualDurationMinutes) }
}

/** Only the parts that were actually chosen, so an unstyled habit stores no empty fields. */
function appearanceOf(draft: Appearance): Appearance {
  return {
    ...(draft.colour ? { colour: draft.colour } : {}),
    ...(draft.pattern ? { pattern: draft.pattern } : {}),
    ...(draft.symbol ? { symbol: draft.symbol } : {}),
  }
}

function habitName(value: string): string {
  const trimmed = value.trim()

  if (!trimmed || trimmed.length > MAX_HABIT_NAME_LENGTH) throw new InvalidHabitNameError(value)

  return trimmed
}
