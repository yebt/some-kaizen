import { timeOfDay, type TimeOfDay } from '@shared/domain/time-of-day'

import { type Habit, isPositive, MAX_HABIT_NAME_LENGTH } from './habit'
import { MAX_ROUTINE_NAME_LENGTH, type Routine } from './routine'
import type { PresetStep, RoutinePreset } from './routine-preset'

/** Identifies the document as a routine of ours, so a backup file is refused rather than half read. */
export const SHARED_ROUTINE_FORMAT = 'some-kaisen.routine'
export const SHARED_ROUTINE_VERSION = 1

/**
 * More steps than a routine is worth reading as, let alone doing.
 *
 * A bound rather than a truncation. A document with two hundred steps is broken, and
 * importing the first twenty of them would be inventing a routine nobody wrote.
 */
export const MAX_SHARED_STEPS = 20

/** Somebody else's prose, and the screen has to show all of it or none. */
export const MAX_SHARED_SUMMARY_LENGTH = 200

/** What a step is given when the habit it came from never said how long it takes. */
export const DEFAULT_SHARED_STEP_MINUTES = 10

export class UnreadableRoutineError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnreadableRoutineError'
  }
}

/**
 * A routine written out to be handed to somebody else.
 *
 * The trust model is the shape of this document rather than a check performed on it. A
 * shared routine is a **recipe, not a record**: names, lengths and an hour, and no way at all
 * of addressing something on the device it lands on. Identifiers, dates, archive flags,
 * entries and habit ids never leave, so there is nothing on the way back in that could
 * overwrite a habit, revive an archived one, or claim to be a routine already here.
 *
 * That is also why it reads into a `RoutinePreset` rather than into a `Routine`. The import
 * that already exists mints every identifier locally, matches habits by name, and shows what
 * it will create and reuse before writing a thing. A routine from a stranger arrives through
 * exactly the same door as one the app itself ships, because it is exactly as trusted.
 */
export interface SharedRoutineDocument {
  readonly format: string
  readonly version: number
  readonly name: string
  readonly summary: string
  readonly anchorTime?: number
  readonly steps: readonly PresetStep[]
}

/**
 * Writes out the routine and the habits it holds, and nothing else.
 *
 * The habits are filtered by the routine rather than trusted to be the right list. Handing
 * the whole library in and taking what belongs would otherwise be one mistaken argument away
 * from putting somebody's entire set of habits in a file they meant to share one part of.
 */
export function writeSharedRoutine(
  routine: Routine,
  habits: readonly Habit[],
  summary?: string,
): string {
  const byId = new Map(habits.map((habit) => [habit.id, habit]))

  const document: SharedRoutineDocument = {
    format: SHARED_ROUTINE_FORMAT,
    version: SHARED_ROUTINE_VERSION,
    name: routine.name,
    summary: '',
    ...(routine.anchorTime === undefined ? {} : { anchorTime: routine.anchorTime }),
    steps: routine.habitIds.flatMap((id) => {
      const habit = byId.get(id)

      // Only the things you do. A habit that is something to avoid has no length and cannot
      // be a step in a sequence, and the import on the other side would not take one either.
      if (!habit || !isPositive(habit)) return []

      return [
        {
          name: habit.name,
          durationMinutes: habit.usualDurationMinutes ?? DEFAULT_SHARED_STEP_MINUTES,
        },
      ]
    }),
  }

  return JSON.stringify(
    {
      ...document,
      summary: (summary?.trim() || describe(document.steps)).slice(0, MAX_SHARED_SUMMARY_LENGTH),
    },
    null,
    2,
  )
}

/**
 * The line the receiving screen chooses between routines by.
 *
 * Written for the sender rather than asked of them. A form with a description field is a form
 * somebody leaves empty or abandons, and what the routine is is already known: how many steps
 * it has and how long they take.
 */
function describe(steps: readonly PresetStep[]): string {
  const minutes = steps.reduce((total, step) => total + step.durationMinutes, 0)

  return `${steps.length} ${steps.length === 1 ? 'step' : 'steps'}, ${minutes} min`
}

/**
 * Reads a routine somebody else wrote, refusing anything it does not understand.
 *
 * Refusing rather than repairing. A document with a four hundred character name or a negative
 * length is broken, and quietly cutting it to size would import something nobody wrote and
 * leave them wondering where the rest went. The one exception is the anchor hour, which is a
 * decoration: losing it costs an ordering, and throwing away four good steps over it would be
 * the strictness doing more damage than the fault.
 */
export function readSharedRoutine(text: string): RoutinePreset {
  const raw = parse(text)

  if (raw.format !== SHARED_ROUTINE_FORMAT) {
    throw new UnreadableRoutineError('That is not a routine written by this app.')
  }

  if (raw.version !== SHARED_ROUTINE_VERSION) {
    throw new UnreadableRoutineError(
      `That routine is version ${String(raw.version)}, and this app reads version ${SHARED_ROUTINE_VERSION}.`,
    )
  }

  const name = readName(raw.name, MAX_ROUTINE_NAME_LENGTH, 'routine')
  const steps = readSteps(raw.steps)
  const summary = typeof raw.summary === 'string' ? raw.summary.trim() : ''

  if (summary.length > MAX_SHARED_SUMMARY_LENGTH) {
    throw new UnreadableRoutineError('That routine carries more description than a screen shows.')
  }

  const anchorTime = readAnchor(raw.anchorTime)

  return {
    // Minted here and never read. A document claiming a bundled preset's key would put
    // somebody else's writing under a name this app vouches for.
    key: `shared:${name.toLowerCase()}`,
    name,
    summary,
    steps,
    ...(anchorTime === undefined ? {} : { anchorTime }),
  }
}

function parse(text: string): Record<string, unknown> {
  let raw: unknown

  try {
    raw = JSON.parse(text)
  } catch {
    throw new UnreadableRoutineError('That is not readable as a shared routine.')
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new UnreadableRoutineError('That is not a shared routine.')
  }

  return raw as Record<string, unknown>
}

function readName(raw: unknown, limit: number, what: string): string {
  if (typeof raw !== 'string') throw new UnreadableRoutineError(`That ${what} has no name.`)

  const name = raw.trim()

  if (!name || name.length > limit) {
    throw new UnreadableRoutineError(
      `A ${what} needs a name of at most ${limit} characters, and that one does not have it.`,
    )
  }

  return name
}

function readSteps(raw: unknown): readonly PresetStep[] {
  if (!Array.isArray(raw)) throw new UnreadableRoutineError('That routine has no steps in it.')

  if (raw.length === 0) throw new UnreadableRoutineError('That routine has nothing in it.')

  if (raw.length > MAX_SHARED_STEPS) {
    throw new UnreadableRoutineError(
      `A shared routine can hold at most ${MAX_SHARED_STEPS} steps, and that one holds ${raw.length}.`,
    )
  }

  return raw.map((step) => {
    if (typeof step !== 'object' || step === null || Array.isArray(step)) {
      throw new UnreadableRoutineError('One of that routine’s steps is not a step.')
    }

    const { name, durationMinutes } = step as Record<string, unknown>

    if (
      typeof durationMinutes !== 'number' ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes <= 0 ||
      durationMinutes > 24 * 60
    ) {
      throw new UnreadableRoutineError('One of that routine’s steps has no sensible length.')
    }

    return { name: readName(name, MAX_HABIT_NAME_LENGTH, 'step'), durationMinutes }
  })
}

function readAnchor(raw: unknown): TimeOfDay | undefined {
  if (typeof raw !== 'number') return undefined

  try {
    return timeOfDay(raw)
  } catch {
    return undefined
  }
}

/**
 * `some-kaisen-routine-morning.json`, so a folder of them can be told apart.
 *
 * A name with nothing a filename can use falls back rather than failing. The routine is fine;
 * only its filename is stuck, and refusing to share one over the characters in its name would
 * be the app being precious about something nobody asked it to care about.
 */
export function sharedRoutineFileName(routine: Routine): string {
  const slug = routine.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug ? `some-kaisen-routine-${slug}.json` : 'some-kaisen-routine.json'
}
