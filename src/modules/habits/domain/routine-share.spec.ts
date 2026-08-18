import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'

import { createCompletedHabit, createNegativeHabit, frequency, type Habit } from './habit'
import { createRoutine } from './routine'
import {
  MAX_SHARED_STEPS,
  sharedRoutineFileName,
  readSharedRoutine,
  SHARED_ROUTINE_FORMAT,
  UnreadableRoutineError,
  writeSharedRoutine,
} from './routine-share'

const TODAY = calendarDate('2026-03-01')

function habitNamed(name: string, usualDurationMinutes?: number): Habit {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: TODAY,
    ...(usualDurationMinutes === undefined ? {} : { usualDurationMinutes }),
  })
}

function morning(habits: readonly Habit[]) {
  return createRoutine({
    id: newIdentifier(),
    name: 'Morning',
    habitIds: habits.map((habit) => habit.id),
    createdOn: TODAY,
    anchorTime: timeOfDay(7 * 60),
  })
}

function shared(habits: readonly Habit[] = [habitNamed('Stretch', 10), habitNamed('Read', 20)]) {
  return writeSharedRoutine(morning(habits), habits, 'How I start the day')
}

function document(overrides: Record<string, unknown>) {
  return JSON.stringify({ ...JSON.parse(shared()), ...overrides })
}

describe('writing one out', () => {
  it('carries the names, the lengths and the hour', () => {
    const preset = readSharedRoutine(shared())

    expect(preset.name).toBe('Morning')
    expect(preset.summary).toBe('How I start the day')
    expect(preset.anchorTime).toBe(7 * 60)
    expect(preset.steps).toEqual([
      { name: 'Stretch', durationMinutes: 10 },
      { name: 'Read', durationMinutes: 20 },
    ])
  })

  /**
   * Nothing that can address anything of yours goes in.
   *
   * This is the whole trust model. A shared routine is a recipe, not a record: it says what
   * to do and how long it takes, and it has no way of naming, replacing or reviving a single
   * thing already on the device it lands on. Everything else — identifiers, dates, archive
   * flags, entries — is left behind at the point of writing, so there is nothing to sanitise
   * on the way back in.
   */
  it('leaves every identifier and every date behind', () => {
    const raw = shared()

    expect(raw).not.toContain('"id"')
    expect(raw).not.toContain('"createdOn"')
    expect(raw).not.toContain('"archivedOn"')
    expect(raw).not.toContain('"habitIds"')
  })

  it('says the length a habit is usually given, and nothing when it has none', () => {
    const preset = readSharedRoutine(shared([habitNamed('Stretch')]))

    // Read back as a default rather than as a claim: the sender never said how long, and a
    // step with no length cannot be built into a day.
    expect(preset.steps[0]!.durationMinutes).toBeGreaterThan(0)
  })

  it('names the habits in the routine and no others', () => {
    const inside = [habitNamed('Stretch', 10)]
    const outside = habitNamed('Something private', 5)

    const preset = readSharedRoutine(writeSharedRoutine(morning(inside), [...inside, outside], ''))

    expect(preset.steps.map((step) => step.name)).toEqual(['Stretch'])
  })
})

describe('the line that describes it', () => {
  /**
   * Written for you rather than asked for.
   *
   * The receiving screen needs one line to choose between routines, and a form asking for it
   * is a form somebody leaves empty or abandons. What the routine is is already known: how
   * many steps and how long they take.
   */
  it('describes the routine when the sender said nothing about it', () => {
    const habits = [habitNamed('Stretch', 10), habitNamed('Read', 20)]

    const preset = readSharedRoutine(writeSharedRoutine(morning(habits), habits))

    expect(preset.summary).toMatch(/2 steps/)
    expect(preset.summary).toMatch(/30 min/)
  })

  it('keeps what the sender did say', () => {
    const habits = [habitNamed('Stretch', 10)]

    const preset = readSharedRoutine(writeSharedRoutine(morning(habits), habits, 'Mine'))

    expect(preset.summary).toBe('Mine')
  })
})

describe('reading one somebody else wrote', () => {
  it('refuses text that is not JSON at all', () => {
    expect(() => readSharedRoutine('not json')).toThrow(UnreadableRoutineError)
  })

  it('refuses a file of ours that is not a routine', () => {
    expect(() => readSharedRoutine(document({ format: 'some-kaisen.backup' }))).toThrow(
      UnreadableRoutineError,
    )
  })

  it('refuses a version it does not read, rather than guessing at it', () => {
    expect(() => readSharedRoutine(document({ version: 99 }))).toThrow(UnreadableRoutineError)
  })

  /**
   * A key of its own, minted here rather than read.
   *
   * A document claiming the key of a bundled preset would let a screen that addresses one by
   * key show somebody else's writing under a name this app vouches for.
   */
  it('gives it a key that no document can choose', () => {
    const preset = readSharedRoutine(document({ key: 'calm-15' }))

    expect(preset.key).not.toBe('calm-15')
  })

  it('refuses more steps than the app would ever show', () => {
    const steps = Array.from({ length: MAX_SHARED_STEPS + 1 }, (_, index) => ({
      name: `Step ${index}`,
      durationMinutes: 5,
    }))

    expect(() => readSharedRoutine(document({ steps }))).toThrow(UnreadableRoutineError)
  })

  it('refuses one with no steps, which would import an empty routine', () => {
    expect(() => readSharedRoutine(document({ steps: [] }))).toThrow(UnreadableRoutineError)
  })

  it('refuses a name the model would refuse, rather than cutting it down', () => {
    // Truncating invents content. A name of four hundred characters is a broken document, and
    // saying so is more useful than silently importing the first forty.
    expect(() => readSharedRoutine(document({ name: 'x'.repeat(400) }))).toThrow(
      UnreadableRoutineError,
    )
  })

  it('refuses a step whose length is not a length', () => {
    expect(() =>
      readSharedRoutine(document({ steps: [{ name: 'Stretch', durationMinutes: -5 }] })),
    ).toThrow(UnreadableRoutineError)
  })

  it('refuses a step with no name', () => {
    expect(() =>
      readSharedRoutine(document({ steps: [{ name: '   ', durationMinutes: 5 }] })),
    ).toThrow(UnreadableRoutineError)
  })

  it('caps how much of somebody else’s prose a screen has to show', () => {
    expect(() => readSharedRoutine(document({ summary: 'x'.repeat(2000) }))).toThrow(
      UnreadableRoutineError,
    )
  })

  it('ignores an hour that is not a number at all', () => {
    expect(readSharedRoutine(document({ anchorTime: 'lunchtime' })).anchorTime).toBeUndefined()
  })

  it('ignores a number that is not an hour, rather than refusing the routine over it', () => {
    // An anchor is the one optional thing here, and losing it costs an ordering rather than
    // the routine. Refusing outright would throw away four good steps over a decoration.
    const preset = readSharedRoutine(document({ anchorTime: 99_999 }))

    expect(preset.anchorTime).toBeUndefined()
    expect(preset.steps).toHaveLength(2)
  })

  it('ignores anything else the document carries', () => {
    const preset = readSharedRoutine(
      document({ id: 'theirs', habitIds: ['theirs'], entries: [{ outcome: 'done' }] }),
    )

    expect(preset).not.toHaveProperty('id')
    expect(preset).not.toHaveProperty('habitIds')
    expect(preset).not.toHaveProperty('entries')
  })

  it('reads what it wrote, which is the only compatibility that matters', () => {
    expect(readSharedRoutine(shared()).name).toBe('Morning')
    expect(JSON.parse(shared()).format).toBe(SHARED_ROUTINE_FORMAT)
  })
})

describe('the file it is written to', () => {
  it('is named after the routine, so a folder of them can be told apart', () => {
    expect(sharedRoutineFileName(morning([habitNamed('Stretch', 10)]))).toBe(
      'some-kaisen-routine-morning.json',
    )
  })

  it('survives a name with nothing a filename can use', () => {
    const routine = { ...morning([habitNamed('Stretch', 10)]), name: '☀︎ ☾' }

    // Not an error: the routine is fine and only the filename is stuck. Refusing to share a
    // routine over the characters in its name would be the app being precious.
    expect(sharedRoutineFileName(routine)).toBe('some-kaisen-routine.json')
  })
})

describe('what a routine can carry', () => {
  it('leaves out a habit that is something to avoid', () => {
    // No length, and not a step in a sequence. The import on the other side would not take
    // one either, so writing it out would promise something that cannot arrive.
    const avoid = createNegativeHabit({
      id: newIdentifier(),
      name: 'No scrolling in bed',
      createdOn: TODAY,
    })
    const stretch = habitNamed('Stretch', 10)

    const routine = createRoutine({
      id: newIdentifier(),
      name: 'Wind down',
      habitIds: [avoid.id, stretch.id],
      createdOn: TODAY,
    })

    const preset = readSharedRoutine(writeSharedRoutine(routine, [avoid, stretch]))

    expect(preset.steps.map((step) => step.name)).toEqual(['Stretch'])
  })
})
