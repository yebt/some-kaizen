import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'

import {
  archiveRoutine,
  assignToRoutine,
  createRoutine,
  DuplicateHabitInRoutineError,
  habitsAlreadyGrouped,
  InvalidRoutineNameError,
  isRoutineActiveOn,
  restoreRoutine,
  MAX_ROUTINE_NAME_LENGTH,
  routineOf,
} from './routine'

const CREATED_ON = calendarDate('2020-01-01')

function routine(name: string, habitIds: Identifier[] = [], id = newIdentifier()) {
  return createRoutine({ id, name, habitIds, createdOn: CREATED_ON })
}

describe('naming a part of the day', () => {
  it('keeps the name it was given', () => {
    expect(routine('Morning').name).toBe('Morning')
  })

  it('trims it, so a stray space is not a different routine', () => {
    expect(routine('  Morning  ').name).toBe('Morning')
  })

  it('refuses a name that is only whitespace', () => {
    expect(() => routine('   ')).toThrow(InvalidRoutineNameError)
  })

  it('refuses one too long to sit in a heading', () => {
    expect(() => routine('x'.repeat(MAX_ROUTINE_NAME_LENGTH + 1))).toThrow(InvalidRoutineNameError)
  })

  it('allows an empty one, because the part of the day is named before it is filled', () => {
    expect(routine('Evening').habitIds).toEqual([])
  })
})

describe('what a routine may contain', () => {
  it('keeps its habits in the order given, because a morning is a sequence', () => {
    const [first, second, third] = [newIdentifier(), newIdentifier(), newIdentifier()]

    expect(routine('Morning', [third, first, second]).habitIds).toEqual([third, first, second])
  })

  it('refuses the same habit twice', () => {
    const habitId = newIdentifier()

    expect(() => routine('Morning', [habitId, habitId])).toThrow(DuplicateHabitInRoutineError)
  })

  it('copies the list, so the caller cannot reorder it afterwards', () => {
    const ids = [newIdentifier(), newIdentifier()]
    const built = routine('Morning', ids)

    ids.reverse()

    expect(built.habitIds).not.toEqual(ids)
  })
})

describe('a habit belongs to one routine', () => {
  it('reports which other routine already has it, by name', () => {
    // A refusal with no names leaves someone opening every other routine to find out.
    const habitId = newIdentifier()
    const morning = routine('Morning', [habitId])
    const evening = routine('Evening', [habitId])

    const clash = habitsAlreadyGrouped(evening, [morning])

    expect(clash).toHaveLength(1)
    expect(clash[0]?.routine.name).toBe('Morning')
  })

  it('does not report a routine against itself', () => {
    const habitId = newIdentifier()
    const morning = routine('Morning', [habitId])

    expect(habitsAlreadyGrouped(morning, [morning])).toEqual([])
  })

  it('says nothing when the two share no habits', () => {
    const morning = routine('Morning', [newIdentifier()])
    const evening = routine('Evening', [newIdentifier()])

    expect(habitsAlreadyGrouped(evening, [morning])).toEqual([])
  })
})

describe('moving a habit between routines', () => {
  const habitId = newIdentifier()

  it('takes it out of the one that had it', () => {
    const morning = routine('Morning', [habitId])
    const evening = routine('Evening')

    const moved = assignToRoutine([morning, evening], habitId, evening.id)

    expect(moved[0]?.habitIds).toEqual([])
    expect(moved[1]?.habitIds).toEqual([habitId])
  })

  it('appends rather than guessing where in a morning it belongs', () => {
    const existing = newIdentifier()
    const morning = routine('Morning', [existing])

    expect(assignToRoutine([morning], habitId, morning.id)[0]?.habitIds).toEqual([
      existing,
      habitId,
    ])
  })

  it('takes it out of every routine when the target is none', () => {
    const morning = routine('Morning', [habitId])

    expect(assignToRoutine([morning], habitId, null)[0]?.habitIds).toEqual([])
  })

  it('leaves untouched routines identical, so nothing else looks edited', () => {
    // Object identity matters here: a merge compares by value, and rewriting a routine
    // nobody changed would report a collision nobody caused.
    const other = routine('Evening', [newIdentifier()])
    const morning = routine('Morning', [habitId])

    expect(assignToRoutine([morning, other], habitId, null)[1]).toBe(other)
  })

  it('does not add it twice when it is already there', () => {
    const morning = routine('Morning', [habitId])

    expect(assignToRoutine([morning], habitId, morning.id)[0]?.habitIds).toEqual([habitId])
  })
})

describe('finding and retiring', () => {
  it('finds the routine a habit belongs to', () => {
    const habitId = newIdentifier()
    const morning = routine('Morning', [habitId])

    expect(routineOf([routine('Evening'), morning], habitId)?.name).toBe('Morning')
  })

  it('finds nothing for a habit in none', () => {
    expect(routineOf([routine('Morning')], newIdentifier())).toBeUndefined()
  })

  it('stays active on the day it was archived, which was still lived under it', () => {
    const retired = archiveRoutine(routine('Morning'), calendarDate('2026-03-10'))

    expect(isRoutineActiveOn(retired, calendarDate('2026-03-10'))).toBe(true)
    expect(isRoutineActiveOn(retired, calendarDate('2026-03-11'))).toBe(false)
  })
})

describe('the hour a routine usually starts at', () => {
  it('is kept when one is given', () => {
    const morning = createRoutine({
      id: newIdentifier(),
      name: 'Morning',
      habitIds: [],
      createdOn: CREATED_ON,
      anchorTime: timeOfDay(6 * 60 + 30),
    })

    expect(morning.anchorTime).toBe(timeOfDay(6 * 60 + 30))
  })

  it('is absent rather than midnight when none is given', () => {
    expect('anchorTime' in routine('Morning')).toBe(false)
  })

  it('survives being archived and restored', () => {
    const morning = createRoutine({
      id: newIdentifier(),
      name: 'Morning',
      habitIds: [],
      createdOn: CREATED_ON,
      anchorTime: timeOfDay(6 * 60),
    })

    expect(restoreRoutine(archiveRoutine(morning, calendarDate('2026-03-10'))).anchorTime).toBe(
      timeOfDay(6 * 60),
    )
  })
})
