import type { Identifier } from '@shared/domain/identifier'
import type { CalendarDate } from '@shared/domain/calendar-date'
import { isRoutineActiveOn, type Routine } from '@modules/habits/domain/routine'

import type { DayDuty } from './day-agenda'

/**
 * One heading on the day, with everything under it.
 *
 * `routine` is absent for the group that holds whatever belongs to no routine. That group is
 * not a routine called "other" — it is the absence of one, and giving it a name in the model
 * would mean every rule about routines needing an exception for the fake one.
 */
export interface DutyGroup<T> {
  readonly key: string
  readonly routine?: Routine
  readonly duties: readonly T[]
  /** How many of them are finished, and how many there are. Shown as `[3/4]`. */
  readonly done: number
  readonly total: number
}

/**
 * Arranges a day's duties under the routines that own them.
 *
 * Order comes from three places and none of them is alphabetical. Routines that named an hour
 * appear in clock order, so the day reads in the order it is lived; the rest follow in the
 * order they were created, which is the order someone built their day in; and the habits inside
 * one appear in the routine's own order, because a morning is a sequence rather than a set.
 *
 * A routine with no hour sorts after every routine with one, rather than at midnight. Saying
 * nothing about when something happens is not a claim that it happens first.
 *
 * Anything with no routine is collected into a single trailing group. It goes last rather than
 * first on the grounds that a habit nobody has placed in a part of the day is, by definition,
 * the part of the day nobody has arranged yet.
 *
 * An empty routine produces no heading. A group that says `[0/0]` is a heading about nothing,
 * and a day full of them is the arrangement getting in the way of the arrangement.
 */
export function groupByRoutine<T extends { readonly duty: DayDuty }>(
  duties: readonly T[],
  routines: readonly Routine[],
  date: CalendarDate,
  isDone: (entry: T) => boolean,
): Array<DutyGroup<T>> {
  const remaining = new Map<Identifier, T[]>()

  for (const entry of duties) {
    const forHabit = remaining.get(entry.duty.habit.id) ?? []

    forHabit.push(entry)
    remaining.set(entry.duty.habit.id, forHabit)
  }

  const groups: Array<DutyGroup<T>> = []
  const claimed = new Set<Identifier>()

  // Sorted on a copy: the caller's array is theirs, and a stable sort is what keeps two
  // routines sharing an hour in the order they were built.
  const inOrder = [...routines].sort(
    (left, right) => (left.anchorTime ?? Infinity) - (right.anchorTime ?? Infinity),
  )

  for (const routine of inOrder) {
    if (!isRoutineActiveOn(routine, date)) continue

    const inside: T[] = []

    for (const habitId of routine.habitIds) {
      const forHabit = remaining.get(habitId)

      if (!forHabit) continue

      claimed.add(habitId)
      inside.push(...forHabit)
    }

    if (inside.length === 0) continue

    groups.push({
      key: routine.id,
      routine,
      duties: inside,
      done: inside.filter(isDone).length,
      total: inside.length,
    })
  }

  const loose = duties.filter((entry) => !claimed.has(entry.duty.habit.id))

  if (loose.length > 0) {
    groups.push({
      key: 'unarranged',
      duties: loose,
      done: loose.filter(isDone).length,
      total: loose.length,
    })
  }

  return groups
}

/** Whether the day is arranged at all, which is what decides if headings are worth drawing. */
export function hasArrangement<T>(groups: ReadonlyArray<DutyGroup<T>>): boolean {
  return groups.some((group) => group.routine !== undefined)
}
