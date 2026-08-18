import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { interval, timeOfDay } from '@shared/domain/time-of-day'
import { createBlockTime, type BlockTime } from '@modules/block-time/domain/block-time'
import {
  createCompletedHabit,
  createMeasuredHabit,
  frequency,
  type Habit,
  measure,
} from '@modules/habits/domain/habit'
import { type HabitEntry, recordCompleted } from '@modules/habits/domain/habit-entry'
import { createRoutine } from '@modules/habits/domain/routine'
import { planInstance } from '@modules/planning/domain/planned-instance'

import type { Dataset } from './dataset'
import { mergeDataset } from './merge'

const CREATED_ON = calendarDate('2020-01-01')
const DAY = calendarDate('2026-03-11')

const EMPTY: Dataset = {
  habits: [],
  entries: [],
  instances: [],
  blocks: [],
  routines: [],
  challenges: [],
  challengeDays: [],
}

function habitNamed(name: string, id: Identifier = newIdentifier()) {
  return createCompletedHabit({
    id,
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function dataset(parts: Partial<Dataset>): Dataset {
  return { ...EMPTY, ...parts }
}

describe('bringing in what is missing', () => {
  it('adds a habit the file has and this device does not', () => {
    const mine = dataset({ habits: [habitNamed('Meditate')] })
    const theirs = dataset({ habits: [habitNamed('Run')] })

    const report = mergeDataset(mine, theirs)

    expect(report.dataset.habits.map((habit) => habit.name).sort()).toEqual(['Meditate', 'Run'])
    expect(report.added.habits).toBe(1)
  })

  it('never removes something the file does not mention', () => {
    // A backup carries no tombstones, so an absent record means the file is older or came
    // from elsewhere — not that anything was deleted.
    const mine = dataset({ habits: [habitNamed('Meditate')] })

    expect(mergeDataset(mine, EMPTY).dataset.habits).toHaveLength(1)
  })

  it('adds occurrences, entries and blocks too', () => {
    const habit = habitNamed('Meditate')
    const theirs = dataset({
      habits: [habit],
      entries: [recordCompleted(newIdentifier(), habit, DAY, true)],
      instances: [
        planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      ],
      blocks: [
        createBlockTime({
          id: newIdentifier(),
          name: 'Work',
          span: interval(timeOfDay(540), 480),
          weekdays: [1],
          createdOn: CREATED_ON,
        }),
      ],
    })

    const report = mergeDataset(EMPTY, theirs)

    expect(report.added).toEqual({
      habits: 1,
      entries: 1,
      instances: 1,
      blocks: 1,
      routines: 0,
      challenges: 0,
      challengeDays: 0,
    })
  })

  it('leaves an identical record alone rather than reporting it', () => {
    const habit = habitNamed('Meditate')
    const mine = dataset({ habits: [habit] })

    const report = mergeDataset(mine, dataset({ habits: [habit] }))

    expect(report.dataset.habits).toHaveLength(1)
    expect(report.collisions).toEqual([])
    expect(report.added.habits).toBe(0)
  })

  it('does not mistake a different key order for a difference', () => {
    // Key order is not part of what a record means, and comparing raw JSON would bury the
    // real conflicts under fake ones.
    const habit = habitNamed('Meditate')
    const reordered = JSON.parse(
      JSON.stringify({
        frequency: habit.frequency,
        tracking: habit.tracking,
        polarity: habit.polarity,
        createdOn: habit.createdOn,
        name: habit.name,
        id: habit.id,
      }),
    ) as Habit

    expect(
      mergeDataset(dataset({ habits: [habit] }), dataset({ habits: [reordered] })).collisions,
    ).toEqual([])
  })
})

describe('when the two disagree', () => {
  it('keeps what is on this device and reports the collision', () => {
    const id = newIdentifier()
    const mine = dataset({ habits: [habitNamed('Meditate', id)] })
    const theirs = dataset({ habits: [habitNamed('Meditation', id)] })

    const report = mergeDataset(mine, theirs)

    expect(report.dataset.habits[0]?.name).toBe('Meditate')
    expect(report.collisions).toHaveLength(1)
    expect(report.collisions[0]).toMatchObject({ kind: 'habit', label: 'Meditate' })
  })

  it('reports a block whose hours differ', () => {
    const id = newIdentifier()
    const block = (start: number): BlockTime =>
      createBlockTime({
        id,
        name: 'Work',
        span: interval(timeOfDay(start), 480),
        weekdays: [1],
        createdOn: CREATED_ON,
      })

    const report = mergeDataset(
      dataset({ blocks: [block(540)] }),
      dataset({ blocks: [block(600)] }),
    )

    expect(report.dataset.blocks[0]?.span.start).toBe(540)
    expect(report.collisions[0]).toMatchObject({ kind: 'block' })
  })

  it('reports an occurrence placed differently', () => {
    const id = newIdentifier()
    const habitId = newIdentifier()
    const mine = planInstance({ id, habitId, date: DAY, period: 'daily' })
    const theirs = planInstance({ id, habitId, date: DAY, period: 'daily', durationMinutes: 90 })

    const report = mergeDataset(dataset({ instances: [mine] }), dataset({ instances: [theirs] }))

    expect(report.dataset.instances[0]?.durationMinutes).toBe(mine.durationMinutes)
    expect(report.collisions[0]).toMatchObject({ kind: 'occurrence' })
  })
})

describe('entries, which resolve themselves', () => {
  const habit = habitNamed('Meditate')

  function entryAt(id: Identifier, done: boolean, recordedAt: number): HabitEntry {
    return recordCompleted(id, habit, DAY, done, { recordedAt })
  }

  it('takes the newer answer, matching the rule the app already uses', () => {
    const id = newIdentifier()
    const report = mergeDataset(
      dataset({ entries: [entryAt(id, false, 100)] }),
      dataset({ entries: [entryAt(id, true, 200)] }),
    )

    expect(report.dataset.entries[0]?.outcome).toBe('done')
    expect(report.superseded).toBe(1)
  })

  it('keeps the local answer when it is the newer one', () => {
    const id = newIdentifier()
    const report = mergeDataset(
      dataset({ entries: [entryAt(id, true, 200)] }),
      dataset({ entries: [entryAt(id, false, 100)] }),
    )

    expect(report.dataset.entries[0]?.outcome).toBe('done')
    expect(report.superseded).toBe(0)
  })

  it('does not report a superseded entry as a collision, since the rule decided it', () => {
    const id = newIdentifier()
    const report = mergeDataset(
      dataset({ entries: [entryAt(id, false, 100)] }),
      dataset({ entries: [entryAt(id, true, 200)] }),
    )

    expect(report.collisions).toEqual([])
  })

  it('keeps both when they answer different occurrences of the same day', () => {
    const report = mergeDataset(
      dataset({ entries: [entryAt(newIdentifier(), true, 100)] }),
      dataset({ entries: [entryAt(newIdentifier(), false, 200)] }),
    )

    expect(report.dataset.entries).toHaveLength(2)
  })
})

describe('blocks that only collide once both sides are present', () => {
  function block(name: string, start: number) {
    return createBlockTime({
      id: newIdentifier(),
      name,
      span: interval(timeOfDay(start), 120),
      weekdays: [1],
      createdOn: CREATED_ON,
    })
  }

  it('keeps both and says so, rather than refusing data at import time', () => {
    // Each device added something that overlapped nothing it could see, so neither ever went
    // through the check that would have refused it.
    const report = mergeDataset(
      dataset({ blocks: [block('Work', 540)] }),
      dataset({ blocks: [block('Gym', 600)] }),
    )

    expect(report.dataset.blocks).toHaveLength(2)
    expect(report.collisions.filter((collision) => collision.kind === 'overlap')).toHaveLength(1)
  })

  it('names both sides of the overlap', () => {
    const report = mergeDataset(
      dataset({ blocks: [block('Work', 540)] }),
      dataset({ blocks: [block('Gym', 600)] }),
    )

    expect(report.collisions[0]?.label).toContain('Work')
    expect(report.collisions[0]?.label).toContain('Gym')
  })

  it('reports a pair once rather than from both directions', () => {
    const report = mergeDataset(
      dataset({ blocks: [block('Work', 540)] }),
      dataset({ blocks: [block('Gym', 600)] }),
    )

    expect(report.collisions).toHaveLength(1)
  })

  it('says nothing when the two merely touch', () => {
    const report = mergeDataset(
      dataset({ blocks: [block('Work', 540)] }),
      dataset({ blocks: [block('Commute', 660)] }),
    )

    expect(report.collisions).toEqual([])
  })
})

describe('a realistic second device', () => {
  it('brings the other half of your data without losing this half', () => {
    const meditate = habitNamed('Meditate')
    const water = createMeasuredHabit({
      id: newIdentifier(),
      name: 'Drink water',
      frequency: frequency('daily', 1),
      measure: measure('litres', 1, 2),
      createdOn: CREATED_ON,
    })

    const mine = dataset({
      habits: [meditate],
      entries: [recordCompleted(newIdentifier(), meditate, DAY, true, { recordedAt: 10 })],
    })
    const theirs = dataset({
      habits: [water],
      entries: [recordCompleted(newIdentifier(), meditate, DAY, true, { recordedAt: 20 })],
    })

    const report = mergeDataset(mine, theirs)

    expect(report.dataset.habits).toHaveLength(2)
    expect(report.dataset.entries).toHaveLength(2)
    expect(report.collisions).toEqual([])
  })

  it('is idempotent, so importing the same file twice changes nothing', () => {
    const habit = habitNamed('Meditate')
    const theirs = dataset({ habits: [habit] })

    const once = mergeDataset(EMPTY, theirs)
    const twice = mergeDataset(once.dataset, theirs)

    expect(twice.dataset.habits).toHaveLength(1)
    expect(twice.added.habits).toBe(0)
    expect(twice.collisions).toEqual([])
  })
})

describe('routines, which arrange a day rather than fill it', () => {
  function morning(name: string, habitIds: Identifier[] = [], id = newIdentifier()) {
    return createRoutine({ id, name, habitIds, createdOn: CREATED_ON })
  }

  it('brings in one the other device had', () => {
    const report = mergeDataset(EMPTY, dataset({ routines: [morning('Morning')] }))

    expect(report.dataset.routines).toHaveLength(1)
    expect(report.added.routines).toBe(1)
  })

  it('keeps this device’s arrangement when the two disagree', () => {
    // An arrangement is a preference rather than a record, and the device you are standing
    // at is the one whose preference you can still see and correct.
    const id = newIdentifier()
    const report = mergeDataset(
      dataset({ routines: [morning('Morning', [], id)] }),
      dataset({ routines: [morning('Mornings', [], id)] }),
    )

    expect(report.dataset.routines[0]?.name).toBe('Morning')
    expect(report.collisions[0]).toMatchObject({ kind: 'routine', label: 'Morning' })
  })

  it('says nothing when both devices arrange the day the same way', () => {
    const shared = morning('Morning', [newIdentifier()])

    expect(
      mergeDataset(dataset({ routines: [shared] }), dataset({ routines: [shared] })).collisions,
    ).toEqual([])
  })
})
