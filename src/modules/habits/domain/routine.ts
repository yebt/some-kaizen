import type { Appearance } from '@shared/domain/appearance'
import { type CalendarDate, isAfter } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'

/**
 * A named, ordered group of habits — Morning, Deep Work, Wind Down.
 *
 * The thing that makes a fourteen-habit day readable. A flat list of fourteen rows is a list
 * you stop reading by the fourth; the same fourteen under three headings with their own
 * counts is a day you can see the shape of.
 *
 * **A habit belongs to at most one routine.** The tempting alternative is tagging, so that
 * "meditate" can sit in both Morning and Health — but Health is a *category*, not a routine,
 * and conflating the two is the only reason tagging looks necessary. A routine is a sequence
 * you perform in order; you do not perform the same habit twice in one morning because it
 * also belongs to a theme. Owning keeps the model honest and every screen simpler, and
 * categories remain free to cut across later without disturbing it.
 *
 * The order is part of the meaning. Morning is not a set, it is what you do after waking, in
 * the order you do it, and a routine that reordered itself would stop describing anything.
 */
export interface Routine extends Appearance {
  readonly id: Identifier
  readonly name: string
  /** The habits it contains, in the order they are performed. */
  readonly habitIds: readonly Identifier[]
  readonly createdOn: CalendarDate
  /** Archived rather than deleted, so a day already lived keeps its shape. */
  readonly archivedOn?: CalendarDate
}

export const MAX_ROUTINE_NAME_LENGTH = 40

export class InvalidRoutineNameError extends Error {
  constructor(readonly value: string) {
    super(`A routine needs a name of at most ${MAX_ROUTINE_NAME_LENGTH} characters.`)
    this.name = 'InvalidRoutineNameError'
  }
}

export class DuplicateHabitInRoutineError extends Error {
  constructor(readonly habitId: Identifier) {
    super('A habit can appear only once in a routine.')
    this.name = 'DuplicateHabitInRoutineError'
  }
}

export interface RoutineDraft extends Appearance {
  readonly id: Identifier
  readonly name: string
  readonly habitIds: readonly Identifier[]
  readonly createdOn: CalendarDate
  readonly archivedOn?: CalendarDate
}

/**
 * Builds a routine, refusing the two shapes that cannot mean anything.
 *
 * An empty routine is allowed on purpose: you name the part of the day first and fill it
 * afterwards, and refusing that would make the only way to create one a single long form.
 */
export function createRoutine(draft: RoutineDraft): Routine {
  const name = draft.name.trim()

  if (!name || name.length > MAX_ROUTINE_NAME_LENGTH) throw new InvalidRoutineNameError(draft.name)

  const seen = new Set<Identifier>()

  for (const habitId of draft.habitIds) {
    if (seen.has(habitId)) throw new DuplicateHabitInRoutineError(habitId)

    seen.add(habitId)
  }

  return {
    id: draft.id,
    name,
    habitIds: [...draft.habitIds],
    createdOn: draft.createdOn,
    archivedOn: draft.archivedOn,
    colour: draft.colour,
    pattern: draft.pattern,
  }
}

/** Whether the routine is one the day should still be arranging around. */
export function isRoutineActiveOn(routine: Routine, date: CalendarDate): boolean {
  return routine.archivedOn === undefined || !isAfter(date, routine.archivedOn)
}

export function archiveRoutine(routine: Routine, on: CalendarDate): Routine {
  return { ...routine, archivedOn: on }
}

/**
 * Puts an archived routine back to work.
 *
 * The habits it holds never left it, so restoring is only the removal of the end date. This
 * is what makes archiving safe to offer: it is a reversible way of saying "not at the moment"
 * rather than a soft delete you have to rebuild from.
 */
export function restoreRoutine(routine: Routine): Routine {
  return { ...routine, archivedOn: undefined }
}

/**
 * The habits this routine would take from others, which is what makes a save a conflict.
 *
 * Reported rather than refused, and reported as a list rather than a boolean, because the
 * answer the screen needs is "these three are already in Morning" — a refusal with no names
 * leaves someone to find them by opening every other routine.
 */
export function habitsAlreadyGrouped(
  routine: Routine,
  others: readonly Routine[],
): Array<{ habitId: Identifier; routine: Routine }> {
  const claimed: Array<{ habitId: Identifier; routine: Routine }> = []

  for (const other of others) {
    if (other.id === routine.id) continue

    for (const habitId of routine.habitIds) {
      if (other.habitIds.includes(habitId)) claimed.push({ habitId, routine: other })
    }
  }

  return claimed
}

/**
 * Moves a habit into a routine, taking it out of whichever one had it.
 *
 * The whole set is returned rather than the one routine, because "belongs to at most one" is
 * a rule about the set and cannot be kept by a function that can only see half of it.
 */
export function assignToRoutine(
  routines: readonly Routine[],
  habitId: Identifier,
  target: Identifier | null,
): Routine[] {
  return routines.map((routine) => {
    const without = routine.habitIds.filter((id) => id !== habitId)

    if (routine.id !== target) {
      return without.length === routine.habitIds.length
        ? routine
        : { ...routine, habitIds: without }
    }

    // Appended rather than inserted: a habit joining a sequence joins the end of it, and
    // anything else would be guessing where in someone's morning it belongs.
    return { ...routine, habitIds: [...without, habitId] }
  })
}

/** The routine a habit belongs to, if any. */
export function routineOf(routines: readonly Routine[], habitId: Identifier): Routine | undefined {
  return routines.find((routine) => routine.habitIds.includes(habitId))
}
