import type { CalendarDate } from '@shared/domain/calendar-date'
import type { Identifier } from '@shared/domain/identifier'
import { assertDuration, type TimeOfDay } from '@shared/domain/time-of-day'

import { createCompletedHabit, type Habit, isPositive, normalisedName } from './habit'
import { frequency } from './habit'
import { createRoutine, type Routine } from './routine'

/**
 * A routine somebody can start from, instead of facing an empty form.
 *
 * The hard part of a habit tracker is not the tracking, it is the blank page: "name a part of
 * your day and list what you do in it" is a reasonable request only for someone who already
 * knows the answer. A preset is a worked answer to copy and then argue with.
 *
 * Bundled with the app rather than fetched. Offline first is not a feature that can have an
 * exception carved into it — a library that only works online is a library that, on a phone,
 * mostly does not work. Downloading or sharing one can come later, and would need a way to
 * read a routine someone else wrote without trusting it.
 */
export interface PresetStep {
  readonly name: string
  readonly durationMinutes: number
}

export interface RoutinePreset {
  /** Stable across releases, so a screen can address one without depending on its name. */
  readonly key: string
  readonly name: string
  /** One line saying what it is for, which is what someone chooses between. */
  readonly summary: string
  readonly anchorTime?: TimeOfDay
  readonly steps: readonly PresetStep[]
}

/**
 * What importing a preset would do, worked out before anything is written.
 *
 * Returned as a plan rather than performed, because the honest version of this feature tells
 * you what it is about to create and what it is about to reuse. "Add 5 habits" and "add 2,
 * reuse 3 you already have" are very different offers, and only one of them is true.
 */
export interface PresetImport {
  /** Habits the preset has to create, because nothing already answers to that name. */
  readonly created: Habit[]
  /** Habits already here that the routine will simply take, named for the confirmation. */
  readonly reused: Habit[]
  /**
   * Every routine to save, not only the new one.
   *
   * "A habit belongs to at most one routine" is a rule about the whole arrangement, so a
   * reused habit has to leave wherever it was in the same write that puts it here.
   */
  readonly routines: Routine[]
}

export interface PresetMint {
  readonly routineId: Identifier
  readonly newHabitId: () => Identifier
  readonly today: CalendarDate
}

/**
 * Works out what importing a preset would create, reuse and rearrange.
 *
 * Merging rather than duplicating is the whole difficulty. Someone who already tracks
 * "Meditate" and imports a morning routine containing meditation wants their meditation in it
 * — with its history, its streak and its colour — not a second habit of the same name that
 * splits the record in two and can never be reconciled.
 *
 * Archived habits are deliberately not matched. Archiving is a decision to stop, and reviving
 * one as a side effect of importing a template would quietly undo it. A new habit of the same
 * name is the honest outcome: the archived one keeps the history it earned, and the new one
 * starts today.
 */
export function importPreset(
  preset: RoutinePreset,
  existing: { habits: readonly Habit[]; routines: readonly Routine[] },
  mint: PresetMint,
): PresetImport {
  const available = new Map(
    existing.habits
      .filter((habit) => isPositive(habit) && habit.archivedOn === undefined)
      .map((habit) => [normalisedName(habit.name), habit]),
  )

  const created: Habit[] = []
  const reused: Habit[] = []
  const habitIds: Identifier[] = []

  for (const step of preset.steps) {
    const match = available.get(normalisedName(step.name))

    // A repeated step is one step. A routine refuses a habit that appears twice, so pushing
    // the identifier again would build a routine the model rejects — an import failing on
    // data the app itself shipped.
    if (match) {
      if (!habitIds.includes(match.id)) {
        reused.push(match)
        habitIds.push(match.id)
      }

      continue
    }

    const built = createCompletedHabit({
      id: mint.newHabitId(),
      name: step.name,
      // Daily and once, because a step in a sequence is something you do when you do the
      // sequence. Anything rarer is a decision to make on the habit afterwards, not one a
      // template gets to make on someone's behalf.
      frequency: frequency('daily', 1),
      createdOn: mint.today,
      usualDurationMinutes: assertDuration(step.durationMinutes),
    })

    created.push(built)
    habitIds.push(built.id)

    // Added to the map so a preset that lists the same step twice reuses what it just made
    // rather than creating it again and then being refused for the duplicate.
    available.set(normalisedName(step.name), built)
  }

  const routine = createRoutine({
    id: mint.routineId,
    name: preset.name,
    habitIds,
    createdOn: mint.today,
    ...(preset.anchorTime === undefined ? {} : { anchorTime: preset.anchorTime }),
  })

  const taken = new Set(habitIds)

  return {
    created,
    reused,
    routines: [
      ...existing.routines.map((other) =>
        other.habitIds.some((id) => taken.has(id))
          ? { ...other, habitIds: other.habitIds.filter((id) => !taken.has(id)) }
          : other,
      ),
      routine,
    ],
  }
}
