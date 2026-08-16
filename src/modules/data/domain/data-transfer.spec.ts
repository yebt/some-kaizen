import { describe, expect, it } from 'vitest'

import { calendarDate, InvalidCalendarDateError } from '@shared/domain/calendar-date'
import { InvalidIdentifierError, newIdentifier } from '@shared/domain/identifier'
import {
  interval,
  InvalidTimeIntervalError,
  InvalidTimeOfDayError,
  timeOfDay,
} from '@shared/domain/time-of-day'
import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  InvalidMeasureError,
  measure,
  isPositive,
  onWeekdays,
} from '@modules/habits/domain/habit'
import { recordMeasured, recordNegative } from '@modules/habits/domain/habit-entry'
import { InvalidWeekdaysError } from '@shared/domain/calendar-date'
import { createBlockTime } from '@modules/block-time/domain/block-time'
import { createRoutine } from '@modules/habits/domain/routine'
import { planInstance, scheduleAt } from '@modules/planning/domain/planned-instance'

import { BACKUP_FORMAT, InvalidBackupError, parseBackup, serializeDataset } from './data-transfer'
import { type Dataset, EMPTY_DATASET } from './dataset'

const CREATED_ON = calendarDate('2026-01-01')
const EXPORTED_AT = new Date('2026-03-11T10:00:00.000Z')

function fullDataset(): Dataset {
  const water = createMeasuredHabit({
    id: newIdentifier(),
    name: 'Drink water',
    frequency: frequency('daily', 1),
    measure: measure('litres', 1, 2),
    createdOn: CREATED_ON,
    usualTime: timeOfDay(8 * 60),
    usualDurationMinutes: 15,
  })
  const run = createCompletedHabit({
    id: newIdentifier(),
    name: 'Run',
    frequency: frequency('weekly', 2),
    createdOn: CREATED_ON,
  })
  const smoking = createNegativeHabit({
    id: newIdentifier(),
    name: 'Smoking',
    createdOn: CREATED_ON,
  })

  return {
    routines: [
      createRoutine({
        id: newIdentifier(),
        name: 'Morning',
        habitIds: [water.id],
        createdOn: CREATED_ON,
        anchorTime: timeOfDay(6 * 60 + 30),
      }),
    ],
    habits: [water, run, smoking],
    entries: [
      recordMeasured(newIdentifier(), water, calendarDate('2026-03-04'), 1.5, { recordedAt: 10 }),
      recordNegative(
        newIdentifier(),
        smoking,
        calendarDate('2026-03-04'),
        'relapsed',
        calendarDate('2026-03-05'),
        { recordedAt: 20 },
      ),
    ],
    instances: [
      scheduleAt(
        planInstance({
          id: newIdentifier(),
          habitId: run.id,
          date: calendarDate('2026-03-11'),
          period: 'weekly',
          durationMinutes: 45,
        }),
        timeOfDay(1110),
      ),
      planInstance({
        id: newIdentifier(),
        habitId: water.id,
        date: calendarDate('2026-03-11'),
        period: 'daily',
      }),
    ],
    blocks: [
      createBlockTime({
        id: newIdentifier(),
        name: 'Sleep',
        span: interval(timeOfDay(1380), 480),
        weekdays: [1, 2, 3, 4, 5, 6, 7],
        createdOn: CREATED_ON,
      }),
    ],
  }
}

function roundTrip(dataset: Dataset): Dataset {
  return parseBackup(serializeDataset(dataset, EXPORTED_AT))
}

/** Produces a backup whose dataset has been tampered with, as a hand edited file would be. */
function corrupted(mutate: (dataset: Record<string, unknown>) => void): string {
  const backup = JSON.parse(serializeDataset(fullDataset(), EXPORTED_AT))

  mutate(backup.dataset)

  return JSON.stringify(backup)
}

describe('serializeDataset', () => {
  it('stamps the file so a foreign file can be refused rather than half read', () => {
    const backup = JSON.parse(serializeDataset(fullDataset(), EXPORTED_AT))

    expect(backup.format).toBe(BACKUP_FORMAT)
    expect(backup.version).toBe(1)
    expect(backup.exportedAt).toBe('2026-03-11T10:00:00.000Z')
  })
})

describe('a full round trip', () => {
  it('returns every habit unchanged', () => {
    const dataset = fullDataset()

    expect(roundTrip(dataset).habits).toEqual(dataset.habits)
  })

  it('returns every entry unchanged, including the raw amount and the judged day', () => {
    const dataset = fullDataset()

    expect(roundTrip(dataset).entries).toEqual(dataset.entries)
  })

  it('returns occurrences unchanged, with and without a time', () => {
    const dataset = fullDataset()

    expect(roundTrip(dataset).instances).toEqual(dataset.instances)
  })

  it('returns block time unchanged, including a span crossing midnight', () => {
    const dataset = fullDataset()

    expect(roundTrip(dataset).blocks).toEqual(dataset.blocks)
  })

  it('survives an empty dataset', () => {
    const empty: Dataset = { habits: [], entries: [], instances: [], blocks: [], routines: [] }

    expect(roundTrip(empty)).toEqual(empty)
  })

  it('returns the hour a habit usually happens at', () => {
    const dataset = fullDataset()
    const restored = roundTrip(dataset)

    expect(restored.habits).toEqual(dataset.habits)
  })

  it('returns how long a habit usually takes', () => {
    const dataset = fullDataset()
    const [restored] = roundTrip(dataset).habits

    // Asserted on the field by name as well as through the deep comparison above, because a
    // dropped optional field is exactly what a deep comparison of two objects built by the
    // same code can miss when both sides lose it.
    expect(restored).toMatchObject({ usualDurationMinutes: 15 })
  })

  it('returns the hour a routine usually starts at', () => {
    const dataset = fullDataset()

    expect(roundTrip(dataset).routines).toEqual(dataset.routines)
  })

  it('keeps an archived habit archived', () => {
    const dataset = fullDataset()
    const archived: Dataset = {
      ...dataset,
      habits: dataset.habits.map((habit) => ({ ...habit, archivedOn: calendarDate('2026-02-01') })),
    }

    expect(roundTrip(archived).habits.every((habit) => habit.archivedOn === '2026-02-01')).toBe(
      true,
    )
  })
})

describe('refusing a file that is not ours', () => {
  it('rejects text that is not JSON', () => {
    expect(() => parseBackup('not json at all')).toThrow(InvalidBackupError)
  })

  it('rejects JSON that is not an object', () => {
    expect(() => parseBackup('[1, 2, 3]')).toThrow(InvalidBackupError)
  })

  it('rejects a file exported by something else', () => {
    expect(() => parseBackup(JSON.stringify({ format: 'other', version: 1 }))).toThrow(
      /not exported by this app/,
    )
  })

  it('rejects a version this app cannot read, naming both versions', () => {
    expect(() =>
      parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, dataset: {} })),
    ).toThrow(/version 99/)
  })
})

describe('refusing a corrupted file', () => {
  it('rejects a habit with an unknown kind', () => {
    const text = corrupted((dataset) => {
      const habits = dataset.habits as Record<string, unknown>[]

      if (habits[0]) habits[0].polarity = 'sideways'
    })

    expect(() => parseBackup(text)).toThrow(/unknown kind/)
  })

  it('rejects a habit whose goal sits below its minimum', () => {
    // The domain refuses this because it makes a partial day unreachable, and the import
    // must not be a way around that rule.
    const text = corrupted((dataset) => {
      const habits = dataset.habits as Record<string, unknown>[]
      const target = habits.find((habit) => habit.tracking === 'measured')

      if (target) target.measure = { unit: 'litres', minimum: 5, goal: 1 }
    })

    expect(() => parseBackup(text)).toThrow(InvalidMeasureError)
  })

  it('rejects an hour outside the clock, rather than importing a habit nothing can draw', () => {
    const file = corrupted((dataset) => {
      const habits = dataset.habits as Array<Record<string, unknown>>
      const first = habits[0]

      if (first) first.usualTime = 1500
    })

    expect(() => parseBackup(file)).toThrow(InvalidTimeOfDayError)
  })

  it('rejects a length no card could be drawn at, rather than importing it', () => {
    const file = corrupted((dataset) => {
      const habits = dataset.habits as Array<Record<string, unknown>>
      const first = habits[0]

      if (first) first.usualDurationMinutes = 0
    })

    expect(() => parseBackup(file)).toThrow(InvalidTimeIntervalError)
  })

  it('rejects an impossible date', () => {
    const text = corrupted((dataset) => {
      const habits = dataset.habits as Record<string, unknown>[]

      if (habits[0]) habits[0].createdOn = '2026-02-30'
    })

    expect(() => parseBackup(text)).toThrow(InvalidCalendarDateError)
  })

  it('rejects an identifier that is not a UUID', () => {
    const text = corrupted((dataset) => {
      const habits = dataset.habits as Record<string, unknown>[]

      if (habits[0]) habits[0].id = 'nope'
    })

    expect(() => parseBackup(text)).toThrow(InvalidIdentifierError)
  })

  it('rejects a block covering no weekday', () => {
    const text = corrupted((dataset) => {
      const blocks = dataset.blocks as Record<string, unknown>[]

      if (blocks[0]) blocks[0].weekdays = []
    })

    expect(() => parseBackup(text)).toThrow(InvalidWeekdaysError)
  })

  it('rejects a block whose span lasts no time at all', () => {
    const text = corrupted((dataset) => {
      const blocks = dataset.blocks as Record<string, unknown>[]

      if (blocks[0]) blocks[0].span = { start: 540, durationMinutes: 0 }
    })

    expect(() => parseBackup(text)).toThrow(InvalidTimeIntervalError)
  })

  it('rejects an entry with an outcome the app does not know', () => {
    const text = corrupted((dataset) => {
      const entries = dataset.entries as Record<string, unknown>[]
      const target = entries.find((entry) => entry.kind === 'positive')

      if (target) target.outcome = 'brilliant'
    })

    expect(() => parseBackup(text)).toThrow(/unknown outcome/)
  })

  it('rejects a list that is not a list', () => {
    const text = corrupted((dataset) => {
      dataset.habits = 'all of them'
    })

    expect(() => parseBackup(text)).toThrow(/not a list/)
  })

  it('writes nothing partial: the whole file is rejected together', () => {
    // Parsing returns a dataset or throws, so a corrupt tail cannot leave a half import
    // behind in storage.
    const text = corrupted((dataset) => {
      const blocks = dataset.blocks as Record<string, unknown>[]

      if (blocks[0]) blocks[0].weekdays = [9]
    })

    expect(() => parseBackup(text)).toThrow(InvalidWeekdaysError)
  })
})

describe('a habit whose days are named', () => {
  function gym() {
    return createCompletedHabit({
      id: newIdentifier(),
      name: 'Gym',
      frequency: onWeekdays([1, 3, 5]),
      createdOn: calendarDate('2020-01-01'),
    })
  }

  /** A real backup, parsed back into something a test can edit before feeding it in. */
  function tampered() {
    return JSON.parse(
      serializeDataset({ ...EMPTY_DATASET, habits: [gym()] }, new Date('2026-03-11T10:00:00Z')),
    ) as { dataset: { habits: Array<{ frequency: Record<string, unknown> }> } }
  }

  it('survives a round trip through a file', () => {
    const restored = parseBackup(
      serializeDataset({ ...EMPTY_DATASET, habits: [gym()] }, new Date('2026-03-11T10:00:00Z')),
    )

    const [restoredHabit] = restored.habits

    expect(restoredHabit && isPositive(restoredHabit) && restoredHabit.frequency.weekdays).toEqual([
      1, 3, 5,
    ])
  })

  it('rebuilds the repetition count instead of trusting the file', () => {
    // A file that disagreed with itself would otherwise import as a habit that disagrees
    // with itself, and nothing downstream could tell which half was right.
    const raw = tampered()

    raw.dataset.habits[0]!.frequency.repetitions = 99

    const [restored] = parseBackup(JSON.stringify(raw)).habits

    expect(restored && isPositive(restored) && restored.frequency.repetitions).toBe(3)
  })

  it('refuses weekdays that are not a list', () => {
    const raw = tampered()

    raw.dataset.habits[0]!.frequency.weekdays = 'monday'

    expect(() => parseBackup(JSON.stringify(raw))).toThrow(InvalidBackupError)
  })

  it('refuses a day outside the week', () => {
    const raw = tampered()

    raw.dataset.habits[0]!.frequency.weekdays = [9]

    expect(() => parseBackup(JSON.stringify(raw))).toThrow(InvalidWeekdaysError)
  })
})
