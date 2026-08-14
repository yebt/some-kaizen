import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { archiveRoutine, createRoutine } from '@modules/habits/domain/routine'

import type { DayDuty } from './day-agenda'
import { groupByRoutine, hasArrangement } from './routine-agenda'

const CREATED_ON = calendarDate('2020-01-01')
const DAY = calendarDate('2026-03-11')

function habit(name: string) {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function entry(named: ReturnType<typeof habit>, done = false) {
  return { duty: { habit: named } as DayDuty, done }
}

function routine(name: string, habitIds: Identifier[]) {
  return createRoutine({ id: newIdentifier(), name, habitIds, createdOn: CREATED_ON })
}

const isDone = (row: { done: boolean }) => row.done

describe('arranging a day under its routines', () => {
  it('puts a habit under the routine that owns it', () => {
    const meditate = habit('Meditate')
    const groups = groupByRoutine(
      [entry(meditate)],
      [routine('Morning', [meditate.id])],
      DAY,
      isDone,
    )

    expect(groups[0]?.routine?.name).toBe('Morning')
    expect(groups[0]?.duties).toHaveLength(1)
  })

  it('follows the routine’s own order, because a morning is a sequence', () => {
    const first = habit('Wake')
    const second = habit('Stretch')
    const groups = groupByRoutine(
      // Given in the wrong order on purpose.
      [entry(second), entry(first)],
      [routine('Morning', [first.id, second.id])],
      DAY,
      isDone,
    )

    expect(groups[0]?.duties.map((row) => row.duty.habit.name)).toEqual(['Wake', 'Stretch'])
  })

  it('counts what is finished inside each one', () => {
    const a = habit('Wake')
    const b = habit('Stretch')
    const groups = groupByRoutine(
      [entry(a, true), entry(b)],
      [routine('Morning', [a.id, b.id])],
      DAY,
      isDone,
    )

    expect(groups[0]?.done).toBe(1)
    expect(groups[0]?.total).toBe(2)
  })

  it('collects whatever belongs to no routine, at the end', () => {
    // A habit nobody has placed in a part of the day is, by definition, the part of the day
    // nobody has arranged yet.
    const inside = habit('Meditate')
    const loose = habit('Run')
    const groups = groupByRoutine(
      [entry(loose), entry(inside)],
      [routine('Morning', [inside.id])],
      DAY,
      isDone,
    )

    expect(groups.map((group) => group.routine?.name)).toEqual(['Morning', undefined])
    expect(groups[1]?.duties[0]?.duty.habit.name).toBe('Run')
  })

  it('draws no heading for a routine with nothing due today', () => {
    // `[0/0]` is a heading about nothing, and a day full of them is the arrangement getting
    // in the way of the arrangement.
    const groups = groupByRoutine([], [routine('Evening', [newIdentifier()])], DAY, isDone)

    expect(groups).toEqual([])
  })

  it('ignores a routine that was archived before this day', () => {
    const meditate = habit('Meditate')
    const retired = archiveRoutine(routine('Morning', [meditate.id]), calendarDate('2026-03-01'))
    const groups = groupByRoutine([entry(meditate)], [retired], DAY, isDone)

    expect(groups.map((group) => group.routine?.name)).toEqual([undefined])
  })

  it('keeps every occurrence when a habit is due more than once', () => {
    const meditate = habit('Meditate')
    const groups = groupByRoutine(
      [entry(meditate), entry(meditate)],
      [routine('Morning', [meditate.id])],
      DAY,
      isDone,
    )

    expect(groups[0]?.total).toBe(2)
  })

  it('loses nothing: every duty ends up in exactly one group', () => {
    const inside = habit('Meditate')
    const loose = habit('Run')
    const groups = groupByRoutine(
      [entry(inside), entry(loose)],
      [routine('Morning', [inside.id])],
      DAY,
      isDone,
    )

    expect(groups.flatMap((group) => group.duties)).toHaveLength(2)
  })
})

describe('whether the day is arranged at all', () => {
  it('is not, when nothing has a routine', () => {
    expect(hasArrangement(groupByRoutine([entry(habit('Run'))], [], DAY, isDone))).toBe(false)
  })

  it('is, as soon as one group has a name', () => {
    const meditate = habit('Meditate')

    expect(
      hasArrangement(
        groupByRoutine([entry(meditate)], [routine('Morning', [meditate.id])], DAY, isDone),
      ),
    ).toBe(true)
  })
})
