import { addDays, type CalendarDate, weekday } from '@shared/domain/calendar-date'
import {
  type Habit,
  isActiveOn,
  isPositive,
  namesItsDays,
  type PositiveHabit,
} from '@modules/habits/domain/habit'

import { impliedOccurrenceId } from './day-agenda'
import { type PlannedInstance, planInstance, remindBefore, scheduleAt } from './planned-instance'

/**
 * Bringing a day you already arranged onto a day you have not.
 *
 * Most days are not new work. A Tuesday looks like last Tuesday, and rebuilding it card by
 * card is the tax this app exists to remove. Carrying a plan forward is the coarse version of
 * that: take a day that already worked and put it here.
 *
 * It is always an explicit act with a preview, and never something the app does on its own.
 * A planner that quietly fills days is one you stop trusting about the past — once you cannot
 * tell what you decided from what it assumed, none of the history means anything.
 */

/** How far back to look for the same weekday. */
const A_WEEK = 7

/**
 * Which day a plan would be brought from, if any.
 *
 * The same weekday last week first, because a week is the unit a life actually repeats on:
 * last Tuesday had the same lectures, the same gym slot and the same evening as this Tuesday,
 * and yesterday — a Monday — had none of them. Yesterday is the fallback for someone who has
 * not been using the app a week yet, which is exactly when this is most useful.
 *
 * A day with nothing on it is not a plan, so it is skipped rather than offered as an empty
 * one.
 */
export function sourceDayFor(
  target: CalendarDate,
  instances: readonly PlannedInstance[],
): CalendarDate | undefined {
  const occupied = new Set(instances.map((instance) => instance.date))

  return [addDays(target, -A_WEEK), addDays(target, -1)].find((day) => occupied.has(day))
}

/**
 * Whether a habit belongs on a day at all.
 *
 * The interesting case is a habit that names its own days. Carrying Monday's plan onto a
 * Tuesday must drop the Monday-only steps rather than schedule them, or the app has invented
 * a commitment nobody made — and will then mark it missed.
 *
 * A habit that only counts its repetitions is a different matter: "twice a week" leaves the
 * day open on purpose, and choosing this one is exactly what the planner is for.
 */
export function appliesOn(habit: Habit, date: CalendarDate): boolean {
  // Deliberately a plain boolean rather than a type guard. Narrowing on the *false* branch
  // would tell the compiler that anything failing this is a negative habit, which is exactly
  // the wrong conclusion: the most important thing that fails it is a positive habit on a
  // weekday it does not name.
  if (!isPositive(habit) || !isActiveOn(habit, date)) return false

  return !namesItsDays(habit.frequency) || habit.frequency.weekdays.includes(weekday(date))
}

export interface CarriedPlan {
  readonly from: CalendarDate
  /** The occurrences to write onto the target day. */
  readonly carried: PlannedInstance[]
  /** Habits on the source day that do not belong on the target, named for the preview. */
  readonly dropped: PositiveHabit[]
  /** Habits the target day had already, left exactly as they are. */
  readonly kept: PositiveHabit[]
}

export interface CarryDraft {
  readonly from: CalendarDate
  readonly to: CalendarDate
  readonly habits: readonly Habit[]
  readonly instances: readonly PlannedInstance[]
}

/**
 * Works out what carrying a day forward would do, before anything is written.
 *
 * Nothing already on the target day is touched. Carrying adds what is missing and leaves what
 * is there, because a decision you already made about today outranks one you made about a day
 * that has been and gone — and an "import" that silently overwrites is the fastest way to
 * stop anyone using it.
 */
export function carryPlan(draft: CarryDraft): CarriedPlan {
  const byId = new Map(draft.habits.map((habit) => [habit.id, habit]))
  const onSource = draft.instances.filter((instance) => instance.date === draft.from)
  const alreadyHere = new Set(
    draft.instances
      .filter((instance) => instance.date === draft.to)
      .map((instance) => instance.habitId),
  )

  const carried: PlannedInstance[] = []
  const dropped: PositiveHabit[] = []
  const kept: PositiveHabit[] = []
  const slots = new Map<string, number>()

  for (const source of onSource) {
    const habit = byId.get(source.habitId)

    // A habit deleted since is not a step that can be carried anywhere, and it is not worth
    // naming in the preview either — there is nothing left to name it with. A negative habit
    // is skipped for the same reason: it is never planned, so an occurrence of one is a stray
    // record rather than part of an arrangement.
    if (!habit || !isPositive(habit)) continue

    if (!appliesOn(habit, draft.to)) {
      if (!dropped.includes(habit)) dropped.push(habit)
      continue
    }

    if (alreadyHere.has(habit.id)) {
      if (!kept.includes(habit)) kept.push(habit)
      continue
    }

    // Numbered per habit, so a habit arranged twice on the source day arrives twice rather
    // than colliding with itself on one derived identity.
    const slot = slots.get(habit.id) ?? 0

    slots.set(habit.id, slot + 1)
    carried.push(carryOne(source, habit, draft.to, slot))
  }

  return { from: draft.from, carried, dropped, kept }
}

/**
 * One occurrence, moved onto the target day with its arrangement intact.
 *
 * Given the identity the target day derives, so a carried card merges with the duty already
 * implied there instead of sitting beside it and claiming the habit is owed twice.
 *
 * The reminder comes too, when there is a time to count it back from. Carrying is a request
 * for that day's arrangement, and the arrangement included being reminded; dropping it would
 * be a silent edit to what was asked for.
 */
function carryOne(
  source: PlannedInstance,
  habit: PositiveHabit,
  target: CalendarDate,
  slot: number,
): PlannedInstance {
  const base = planInstance({
    id: impliedOccurrenceId(habit.id, target, slot),
    habitId: habit.id,
    date: target,
    period: habit.frequency.period,
    durationMinutes: source.durationMinutes,
  })

  if (source.startsAt === undefined) return base

  const scheduled = scheduleAt(base, source.startsAt)

  return source.reminderMinutesBefore === undefined
    ? scheduled
    : remindBefore(scheduled, source.reminderMinutesBefore)
}
