import type { CalendarDate } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  type FrequencyPeriod,
  type Habit,
  measure,
  normalisedName,
  onWeekdays,
} from './habit'

/**
 * Habits worth considering, for the moment before there are any.
 *
 * The routine presets answer the blank page one level up — "name a part of your day" is only
 * answerable by someone who already knows their answer. This is the same problem one level
 * down and it is the harder one: a first habit is the hardest habit, because nothing on the
 * screen yet suggests what this app is for.
 *
 * Every idea lands as an ordinary habit, editable and deletable from the moment it arrives.
 * Nothing here stays a template, and nothing about having arrived this way is recorded.
 */

/** How often an idea recurs: counted inside a period, or named by its days. */
export type IdeaSchedule =
  | { readonly period: FrequencyPeriod; readonly times: number }
  | { readonly weekdays: readonly number[] }

interface IdeaCore {
  readonly name: string
  /** One line on why it is worth doing, which is what someone actually chooses between. */
  readonly why: string
}

export interface CompletedIdea extends IdeaCore {
  readonly kind: 'completed'
  readonly schedule: IdeaSchedule
  readonly usualDurationMinutes?: number
}

export interface MeasuredIdea extends IdeaCore {
  readonly kind: 'measured'
  readonly schedule: IdeaSchedule
  readonly unit: string
  readonly minimum: number
  readonly goal: number
}

export interface NegativeIdea extends IdeaCore {
  readonly kind: 'negative'
}

export type HabitIdea = CompletedIdea | MeasuredIdea | NegativeIdea

/**
 * A heading in the list, and nothing more.
 *
 * Deliberately *not* a field on the habit. A category earns its keep only if a statistic
 * groups by it, and none does; stored on every habit it would be a taxonomy to maintain that
 * answers no question, and one more thing to get wrong on a form. Here it is a way to find
 * something in a list of twenty, which is a job that ends the moment you have chosen.
 */
export interface IdeaCategory {
  readonly key: string
  readonly name: string
  readonly ideas: readonly HabitIdea[]
}

function scheduleOf(schedule: IdeaSchedule) {
  return 'weekdays' in schedule
    ? onWeekdays(schedule.weekdays)
    : frequency(schedule.period, schedule.times)
}

export interface IdeaMint {
  readonly id: Identifier
  readonly today: CalendarDate
}

/**
 * Turns an idea into an ordinary habit.
 *
 * Built through the same constructors a form uses, so an idea cannot smuggle in a habit the
 * model would have refused — and so a shipped idea that is wrong fails here rather than
 * halfway into storage.
 */
export function habitFromIdea(idea: HabitIdea, mint: IdeaMint): Habit {
  /*
   * The reason travels with the idea.
   *
   * This is the whole point of the list saying *why* rather than only what. Taking "Read —
   * ten pages a day is fifteen books a year" and keeping only the noun throws away the half
   * that survives the third week, and leaves the app unable to answer the question it had
   * just answered for you.
   */
  const core = {
    id: mint.id,
    name: idea.name,
    description: idea.why,
    createdOn: mint.today,
  }

  if (idea.kind === 'negative') return createNegativeHabit(core)

  if (idea.kind === 'measured') {
    return createMeasuredHabit({
      ...core,
      frequency: scheduleOf(idea.schedule),
      measure: measure(idea.unit, idea.minimum, idea.goal),
    })
  }

  return createCompletedHabit({
    ...core,
    frequency: scheduleOf(idea.schedule),
    ...(idea.usualDurationMinutes === undefined
      ? {}
      : { usualDurationMinutes: idea.usualDurationMinutes }),
  })
}

/**
 * Whether something by this name is already being tracked.
 *
 * Any polarity, unlike the routine presets: those reuse only habits that can be *performed*,
 * because a routine step is a thing you do, while this is only answering "have you got this
 * already" — and two habits called "Smoking" would be as confusing as two called "Read".
 *
 * Archived habits do not count. Archiving was a decision to stop, and a list that greyed out
 * an idea because of a habit retired last year would be refusing to offer a fresh start on
 * the grounds that you once gave up.
 */
export function alreadyTracked(habits: readonly Habit[], idea: HabitIdea): boolean {
  return habits.some(
    (habit) =>
      habit.archivedOn === undefined && normalisedName(habit.name) === normalisedName(idea.name),
  )
}

/** Every idea in the library, flattened, for a caller that does not care about headings. */
export function allIdeas(categories: readonly IdeaCategory[]): HabitIdea[] {
  return categories.flatMap((category) => [...category.ideas])
}
