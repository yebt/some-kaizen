import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { createPersistence, type Persistence } from '@core/persistence'
import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { recordCompleted } from '@modules/habits/domain/habit-entry'
import { planInstance } from '@modules/planning/domain/planned-instance'

import { deleteHabitCascade } from './delete-habit'

const CREATED_ON = calendarDate('2026-03-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`delete-habit-spec-${databaseCounter}`)
})

function habitNamed(name: string) {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

describe('deleteHabitCascade', () => {
  it('removes the habit', async () => {
    const habit = habitNamed('Meditate')

    await persistence.habits.save(habit)
    await deleteHabitCascade(persistence, habit.id)

    expect(await persistence.habits.all()).toEqual([])
  })

  it('takes its occurrences with it, so none are left unreachable', async () => {
    const habit = habitNamed('Meditate')

    await persistence.habits.save(habit)
    await persistence.instances.save(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: CREATED_ON,
        period: 'daily',
      }),
    )

    await deleteHabitCascade(persistence, habit.id)

    expect(await persistence.instances.all()).toEqual([])
  })

  it('takes its entries with it, so none count toward a statistic that has no habit', async () => {
    const habit = habitNamed('Meditate')

    await persistence.habits.save(habit)
    await persistence.entries.save(recordCompleted(newIdentifier(), habit, CREATED_ON, true))

    await deleteHabitCascade(persistence, habit.id)

    expect(await persistence.entries.all()).toEqual([])
  })

  it('leaves another habit and its records untouched', async () => {
    const doomed = habitNamed('Meditate')
    const survivor = habitNamed('Run')

    await persistence.habits.saveAll([doomed, survivor])
    await persistence.instances.saveAll([
      planInstance({ id: newIdentifier(), habitId: doomed.id, date: CREATED_ON, period: 'daily' }),
      planInstance({
        id: newIdentifier(),
        habitId: survivor.id,
        date: CREATED_ON,
        period: 'daily',
      }),
    ])
    await persistence.entries.saveAll([
      recordCompleted(newIdentifier(), doomed, CREATED_ON, true),
      recordCompleted(newIdentifier(), survivor, CREATED_ON, true),
    ])

    await deleteHabitCascade(persistence, doomed.id)

    expect((await persistence.habits.all()).map((habit) => habit.name)).toEqual(['Run'])
    expect(await persistence.instances.all()).toHaveLength(1)
    expect(await persistence.entries.all()).toHaveLength(1)
  })

  it('leaves block time alone, which belongs to nobody', async () => {
    const habit = habitNamed('Meditate')

    await persistence.habits.save(habit)
    await deleteHabitCascade(persistence, habit.id)

    expect(await persistence.blocks.all()).toEqual([])
  })

  it('does nothing surprising for a habit that is not there', async () => {
    await expect(deleteHabitCascade(persistence, newIdentifier())).resolves.toBeUndefined()
  })
})
