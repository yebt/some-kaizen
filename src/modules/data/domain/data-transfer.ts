import { type Appearance, patternName } from '@shared/domain/appearance'
import { calendarDate, type CalendarDate } from '@shared/domain/calendar-date'
import { hexColour } from '@shared/domain/colour'
import { identifier, type Identifier } from '@shared/domain/identifier'
import { assertDuration, timeOfDay, type TimeOfDay } from '@shared/domain/time-of-day'
import { createBlockTime, type BlockTime } from '@modules/block-time/domain/block-time'
import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  type FrequencyPeriod,
  onWeekdays,
  type Habit,
  measure,
  type NegativeOutcome,
  type PositiveOutcome,
} from '@modules/habits/domain/habit'
import { type HabitEntry, readNote } from '@modules/habits/domain/habit-entry'
import { createRoutine, type Routine } from '@modules/habits/domain/routine'
import type { PlannedInstance } from '@modules/planning/domain/planned-instance'

import type { Dataset } from './dataset'

/** Identifies the file as ours, so a wrong file is refused rather than half read. */
export const BACKUP_FORMAT = 'some-kaisen.backup'
export const BACKUP_VERSION = 1

export interface Backup {
  readonly format: string
  readonly version: number
  readonly exportedAt: string
  readonly dataset: Dataset
}

export class InvalidBackupError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidBackupError'
  }
}

const PERIODS: readonly FrequencyPeriod[] = ['daily', 'weekly', 'monthly', 'yearly']
const POSITIVE_OUTCOMES: readonly PositiveOutcome[] = ['done', 'partial', 'missed']
const NEGATIVE_OUTCOMES: readonly NegativeOutcome[] = ['avoided', 'relapsed']

export function serializeDataset(dataset: Dataset, exportedAt: Date): string {
  const backup: Backup = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: exportedAt.toISOString(),
    dataset,
  }

  return JSON.stringify(backup, null, 2)
}

/**
 * Reads a backup file, rebuilding every record through the domain's own constructors.
 *
 * The file is untrusted: it may have been hand edited, truncated by a failed transfer, or
 * written by a future version. Trusting its shape would let a single bad field into
 * storage, where it would then break a screen far away from the import with no clue why.
 * Rebuilding means a corrupt file is rejected whole, before anything is written.
 */
export function parseBackup(text: string): Dataset {
  const raw = parseJson(text)
  const backup = asRecord(raw, 'The file is not a backup object.')

  if (backup.format !== BACKUP_FORMAT) {
    throw new InvalidBackupError('That file was not exported by this app.')
  }

  if (backup.version !== BACKUP_VERSION) {
    throw new InvalidBackupError(
      `That backup is version ${String(backup.version)}, and this app reads version ${BACKUP_VERSION}.`,
    )
  }

  const dataset = asRecord(backup.dataset, 'The backup has no data in it.')

  return {
    habits: asArray(dataset.habits, 'habits').map(readHabit),
    entries: asArray(dataset.entries, 'entries').map(readEntry),
    instances: asArray(dataset.instances, 'instances').map(readInstance),
    blocks: asArray(dataset.blocks, 'block time').map(readBlock),
    // Absent rather than refused for a file written before routines existed: an older backup
    // is a real thing to restore, and a missing group is no groups rather than a broken file.
    routines:
      dataset.routines === undefined ? [] : asArray(dataset.routines, 'routines').map(readRoutine),
  }
}

function readRoutine(raw: unknown): Routine {
  const value = asRecord(raw, 'A routine is not an object.')

  if (!Array.isArray(value.habitIds)) {
    throw new InvalidBackupError('A routine needs a list of habits.')
  }

  // Rebuilt through the domain's own constructor, so a hand edited file cannot import a
  // routine holding the same habit twice or carrying a name no screen can draw.
  return createRoutine({
    id: readId(value.id, 'routine'),
    name: asString(value.name, 'A routine needs a name.'),
    habitIds: value.habitIds.map((habitId) => readId(habitId, 'routine')),
    createdOn: readDate(value.createdOn, 'routine'),
    ...readOptionalTime(value.anchorTime, 'anchorTime'),
    archivedOn: value.archivedOn === undefined ? undefined : readDate(value.archivedOn, 'routine'),
    ...readAppearance(value),
  })
}

function readHabit(raw: unknown): Habit {
  const value = asRecord(raw, 'A habit is not an object.')
  const id = readId(value.id, 'habit')
  const name = asString(value.name, 'A habit needs a name.')
  const createdOn = readDate(value.createdOn, 'habit')
  const archivedOn =
    value.archivedOn === undefined ? undefined : readDate(value.archivedOn, 'habit')

  const built = buildHabit(value, {
    id,
    name,
    createdOn,
    ...readAppearance(value),
    ...readOptionalTime(value.usualTime, 'usualTime'),
    ...(value.usualDurationMinutes === undefined
      ? {}
      : {
          usualDurationMinutes: assertDuration(
            asNumber(value.usualDurationMinutes, 'usual duration'),
          ),
        }),
  })

  return archivedOn ? { ...built, archivedOn } : built
}

/**
 * An optional time of day, under the key it was read from.
 *
 * Returns the whole field rather than the value so an absent one contributes nothing at all,
 * which is what keeps "no usual hour" from arriving back as midnight. Validated through the
 * domain's own constructor, so a hand edited file cannot import an hour of 1500.
 */
function readOptionalTime<K extends string>(raw: unknown, key: K): Partial<Record<K, TimeOfDay>> {
  if (raw === undefined) return {}

  return { [key]: timeOfDay(asNumber(raw, key)) } as Record<K, TimeOfDay>
}

/** Colour and pattern are optional, and each is validated only when it is actually present. */
function readAppearance(value: Record<string, unknown>): Appearance {
  return {
    ...(value.colour === undefined
      ? {}
      : { colour: hexColour(asString(value.colour, 'A colour must be text.')) }),
    ...(value.pattern === undefined
      ? {}
      : { pattern: patternName(asString(value.pattern, 'A pattern must be text.')) }),
  }
}

function buildHabit(
  value: Record<string, unknown>,
  core: {
    id: Identifier
    name: string
    createdOn: CalendarDate
    usualTime?: TimeOfDay
    usualDurationMinutes?: number
  } & Appearance,
): Habit {
  if (value.polarity === 'negative') return createNegativeHabit(core)

  if (value.polarity !== 'positive') {
    throw new InvalidBackupError(`A habit has an unknown kind: ${String(value.polarity)}.`)
  }

  const recurrence = readFrequency(value.frequency)

  if (value.tracking === 'measured') {
    const raw = asRecord(value.measure, 'A measured habit needs its thresholds.')

    return createMeasuredHabit({
      ...core,
      frequency: recurrence,
      measure: measure(
        asString(raw.unit, 'A measured habit needs a unit.'),
        asNumber(raw.minimum, 'minimum'),
        asNumber(raw.goal, 'goal'),
      ),
    })
  }

  if (value.tracking !== 'completed') {
    throw new InvalidBackupError(`A habit has an unknown tracking: ${String(value.tracking)}.`)
  }

  return createCompletedHabit({ ...core, frequency: recurrence })
}

function readFrequency(raw: unknown) {
  const value = asRecord(raw, 'A positive habit needs a frequency.')
  const period = value.period

  if (!PERIODS.includes(period as FrequencyPeriod)) {
    throw new InvalidBackupError(`A frequency has an unknown period: ${String(period)}.`)
  }

  // Named days rebuild through their own constructor, which derives the repetition count
  // rather than trusting the file's copy of it: a backup that disagreed with itself would
  // otherwise be imported as a habit that disagrees with itself.
  if (value.weekdays !== undefined) {
    if (!Array.isArray(value.weekdays)) {
      throw new InvalidBackupError('A frequency has weekdays that are not a list.')
    }

    return onWeekdays(value.weekdays.map((day) => asNumber(day, 'weekday')))
  }

  return frequency(period as FrequencyPeriod, asNumber(value.repetitions, 'repetitions'))
}

function readEntry(raw: unknown): HabitEntry {
  const value = asRecord(raw, 'An entry is not an object.')
  const core = {
    id: readId(value.id, 'entry'),
    habitId: readId(value.habitId, 'entry'),
    date: readDate(value.date, 'entry'),
    // Rebuilt through the domain's own reader, so an over-long note from a hand edited file
    // is refused here rather than surfacing later as a row that will not render.
    note: readNote(
      value.note === undefined ? undefined : asString(value.note, 'An entry note is not text.'),
    ),
    recordedAt: asNumber(value.recordedAt, 'recordedAt'),
  }

  if (value.kind === 'negative') {
    if (!NEGATIVE_OUTCOMES.includes(value.outcome as NegativeOutcome)) {
      throw new InvalidBackupError(`An entry has an unknown outcome: ${String(value.outcome)}.`)
    }

    return {
      ...core,
      kind: 'negative',
      outcome: value.outcome as NegativeOutcome,
      recordedOn: readDate(value.recordedOn, 'entry'),
    }
  }

  if (value.kind !== 'positive') {
    throw new InvalidBackupError(`An entry has an unknown kind: ${String(value.kind)}.`)
  }

  if (!POSITIVE_OUTCOMES.includes(value.outcome as PositiveOutcome)) {
    throw new InvalidBackupError(`An entry has an unknown outcome: ${String(value.outcome)}.`)
  }

  return {
    ...core,
    kind: 'positive',
    outcome: value.outcome as PositiveOutcome,
    value: value.value === undefined ? undefined : asNumber(value.value, 'entry value'),
    instanceId: value.instanceId === undefined ? undefined : readId(value.instanceId, 'entry'),
  }
}

function readInstance(raw: unknown): PlannedInstance {
  const value = asRecord(raw, 'An occurrence is not an object.')
  const startsAt = value.startsAt === undefined ? undefined : readTime(value.startsAt, 'occurrence')

  const reminder =
    value.reminderMinutesBefore === undefined
      ? undefined
      : asNumber(value.reminderMinutesBefore, 'reminder')

  const instance: PlannedInstance = {
    id: readId(value.id, 'occurrence'),
    habitId: readId(value.habitId, 'occurrence'),
    date: readDate(value.date, 'occurrence'),
    periodKey: asString(value.periodKey, 'An occurrence needs the period it counts against.'),
    durationMinutes: assertDuration(asNumber(value.durationMinutes, 'duration')),
  }

  if (startsAt === undefined) return instance

  // A reminder only means anything with a start to count back from, so it is dropped with
  // the time rather than restored onto an occurrence that has none.
  return reminder === undefined
    ? { ...instance, startsAt }
    : { ...instance, startsAt, reminderMinutesBefore: reminder }
}

function readBlock(raw: unknown): BlockTime {
  const value = asRecord(raw, 'A block is not an object.')
  const span = asRecord(value.span, 'A block needs a span.')
  const weekdays = asArray(value.weekdays, 'weekdays').map((day) => asNumber(day, 'weekday'))
  const archivedOn =
    value.archivedOn === undefined ? undefined : readDate(value.archivedOn, 'block')

  const block = createBlockTime({
    ...readAppearance(value),
    id: readId(value.id, 'block'),
    name: asString(value.name, 'A block needs a name.'),
    span: {
      start: readTime(span.start, 'block'),
      durationMinutes: assertDuration(asNumber(span.durationMinutes, 'duration')),
    },
    // createBlockTime rejects an out of range or duplicated weekday for us.
    weekdays: weekdays as BlockTime['weekdays'],
    createdOn: readDate(value.createdOn, 'block'),
  })

  return archivedOn ? { ...block, archivedOn } : block
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    throw new InvalidBackupError('That file is not readable as JSON.')
  }
}

function asRecord(raw: unknown, message: string): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new InvalidBackupError(message)
  }

  return raw as Record<string, unknown>
}

function asArray(raw: unknown, what: string): unknown[] {
  if (!Array.isArray(raw)) throw new InvalidBackupError(`The backup's ${what} are not a list.`)

  return raw
}

function asString(raw: unknown, message: string): string {
  if (typeof raw !== 'string') throw new InvalidBackupError(message)

  return raw
}

function asNumber(raw: unknown, what: string): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) {
    throw new InvalidBackupError(`A ${what} must be a number, found ${String(raw)}.`)
  }

  return raw
}

function readId(raw: unknown, what: string): Identifier {
  return identifier(asString(raw, `An ${what} needs an identifier.`))
}

function readDate(raw: unknown, what: string): CalendarDate {
  return calendarDate(asString(raw, `An ${what} needs a date.`))
}

function readTime(raw: unknown, what: string): TimeOfDay {
  return timeOfDay(asNumber(raw, `${what} time`))
}
