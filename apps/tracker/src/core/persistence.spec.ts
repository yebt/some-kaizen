import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { interval, timeOfDay } from '@shared/domain/time-of-day'
import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  measure,
} from '@modules/habits/domain/habit'
import { recordMeasured, recordNegative } from '@modules/habits/domain/habit-entry'
import { createBlockTime } from '@modules/block-time/domain/block-time'
import { planInstance, scheduleAt } from '@modules/planning/domain/planned-instance'

import { createPersistence, type Persistence } from './persistence'

const CREATED_ON = calendarDate('2026-03-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`persistence-spec-${databaseCounter}`)
})

describe('habit storage', () => {
  it('round trips a measured habit with its thresholds intact', async () => {
    const habit = createMeasuredHabit({
      id: newIdentifier(),
      name: 'Drink water',
      frequency: frequency('daily', 1),
      measure: measure('litres', 0.5, 2),
      createdOn: CREATED_ON,
    })

    await persistence.habits.save(habit)

    expect(await persistence.habits.find(habit.id)).toEqual(habit)
  })

  it('round trips a negative habit, which carries no frequency at all', async () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })

    await persistence.habits.save(habit)
    const [stored] = await persistence.habits.all()

    expect(stored).toEqual(habit)
    expect(stored).not.toHaveProperty('frequency')
  })

  it('keeps the discriminant so the loaded habit is still narrowable', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    await persistence.habits.save(habit)
    const stored = await persistence.habits.find(habit.id)

    expect(stored?.polarity).toBe('positive')
  })

  it('separates habits from the other stores', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    await persistence.habits.save(habit)

    expect(await persistence.entries.all()).toEqual([])
    expect(await persistence.blocks.all()).toEqual([])
  })

  it('stops returning a removed habit', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    await persistence.habits.save(habit)
    await persistence.habits.remove(habit.id)

    expect(await persistence.habits.all()).toEqual([])
  })
})

describe('entry storage', () => {
  it('round trips a measured entry with its graded outcome', async () => {
    const habit = createMeasuredHabit({
      id: newIdentifier(),
      name: 'Drink water',
      frequency: frequency('daily', 1),
      measure: measure('litres', 0.5, 2),
      createdOn: CREATED_ON,
    })
    const entry = recordMeasured(newIdentifier(), habit, calendarDate('2026-03-04'), 0.75)

    await persistence.entries.save(entry)

    expect(await persistence.entries.find(entry.id)).toEqual(entry)
  })

  it('keeps the judged day separate from the day it was recorded', async () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    const entry = recordNegative(
      newIdentifier(),
      habit,
      calendarDate('2026-03-04'),
      'relapsed',
      calendarDate('2026-03-05'),
    )

    await persistence.entries.save(entry)
    const stored = await persistence.entries.find(entry.id)

    expect(stored).toMatchObject({ date: '2026-03-04', recordedOn: '2026-03-05' })
  })
})

describe('planned instance storage', () => {
  it('round trips a scheduled occurrence with its time and period key', async () => {
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: newIdentifier(),
        date: calendarDate('2026-03-11'),
        period: 'weekly',
        durationMinutes: 45,
      }),
      timeOfDay(450),
    )

    await persistence.instances.save(instance)

    expect(await persistence.instances.find(instance.id)).toEqual(instance)
  })

  it('round trips an unscheduled occurrence without inventing a time', async () => {
    const instance = planInstance({
      id: newIdentifier(),
      habitId: newIdentifier(),
      date: calendarDate('2026-03-11'),
      period: 'daily',
    })

    await persistence.instances.save(instance)

    expect(await persistence.instances.find(instance.id)).not.toHaveProperty('startsAt')
  })
})

describe('block time storage', () => {
  it('round trips a block that crosses midnight', async () => {
    const block = createBlockTime({
      id: newIdentifier(),
      name: 'Sleep',
      span: interval(timeOfDay(1380), 480),
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      createdOn: CREATED_ON,
    })

    await persistence.blocks.save(block)

    expect(await persistence.blocks.find(block.id)).toEqual(block)
  })
})

describe('saveAll and replaceAll', () => {
  function habitNamed(name: string) {
    return createCompletedHabit({
      id: newIdentifier(),
      name,
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })
  }

  it('writes a batch', async () => {
    await persistence.habits.saveAll([habitNamed('Meditate'), habitNamed('Run')])

    expect(await persistence.habits.all()).toHaveLength(2)
  })

  it('replaces the whole dataset, as an import does', async () => {
    await persistence.habits.saveAll([habitNamed('Old one'), habitNamed('Old two')])
    await persistence.habits.replaceAll([habitNamed('Imported')])

    const stored = await persistence.habits.all()

    expect(stored.map((habit) => habit.name)).toEqual(['Imported'])
  })

  it('does not let a tombstone survive a replace and hide an imported id', async () => {
    const habit = habitNamed('Meditate')

    await persistence.habits.save(habit)
    await persistence.habits.remove(habit.id)
    await persistence.habits.replaceAll([habit])

    expect(await persistence.habits.find(habit.id)).toEqual(habit)
  })
})

describe('durability', () => {
  it('survives reopening the database', async () => {
    const name = `persistence-reopen-${databaseCounter}`
    const first = await createPersistence(name)
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    await first.habits.save(habit)

    const second = await createPersistence(name)

    expect(await second.habits.find(habit.id)).toEqual(habit)
  })
})
