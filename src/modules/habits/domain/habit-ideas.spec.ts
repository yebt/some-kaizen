import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'

import {
  archiveHabit,
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  InvalidMeasureError,
  isMeasured,
  isNegative,
  isPositive,
} from './habit'
import { alreadyTracked, allIdeas, habitFromIdea, type HabitIdea } from './habit-ideas'

const TODAY = calendarDate('2026-03-11')
const EARLIER = calendarDate('2020-01-01')

function mint() {
  return { id: newIdentifier(), today: TODAY }
}

const READ: HabitIdea = {
  kind: 'completed',
  name: 'Read',
  why: 'Ten pages is nothing.',
  schedule: { period: 'daily', times: 1 },
  usualDurationMinutes: 20,
}

const GYM: HabitIdea = {
  kind: 'completed',
  name: 'Strength',
  why: 'Three fixed days.',
  schedule: { weekdays: [1, 3, 5] },
}

const WATER: HabitIdea = {
  kind: 'measured',
  name: 'Drink water',
  why: 'Makes the rest easier.',
  schedule: { period: 'daily', times: 1 },
  unit: 'litres',
  minimum: 1,
  goal: 2,
}

const SMOKING: HabitIdea = {
  kind: 'negative',
  name: 'Smoking',
  why: 'Marked the morning after.',
}

function habitNamed(name: string) {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: EARLIER,
  })
}

describe('turning an idea into a habit', () => {
  it('creates a plain one from a counted schedule', () => {
    const habit = habitFromIdea(READ, mint())

    expect(habit.name).toBe('Read')
    expect(isPositive(habit) && habit.frequency).toEqual({ period: 'daily', repetitions: 1 })
  })

  it('creates one that names its own days when the idea does', () => {
    // "Three times a week" and "Monday, Wednesday and Friday" are different plans, and an
    // idea that has already chosen must not arrive as one that has not.
    const habit = habitFromIdea(GYM, mint())

    expect(isPositive(habit) && habit.frequency.weekdays).toEqual([1, 3, 5])
  })

  it('carries the length so the routine builder works on it at once', () => {
    expect(habitFromIdea(READ, mint())).toMatchObject({ usualDurationMinutes: 20 })
  })

  it('leaves out a length the idea does not state', () => {
    expect(habitFromIdea(GYM, mint())).not.toHaveProperty('usualDurationMinutes')
  })

  it('creates a measured one with its thresholds', () => {
    const habit = habitFromIdea(WATER, mint())

    expect(isMeasured(habit) && habit.measure).toEqual({ unit: 'litres', minimum: 1, goal: 2 })
  })

  it('creates a habit to quit, which has no schedule at all', () => {
    const habit = habitFromIdea(SMOKING, mint())

    expect(isNegative(habit)).toBe(true)
    expect(habit).not.toHaveProperty('frequency')
  })

  it('starts it today rather than backdating a history nobody lived', () => {
    expect(habitFromIdea(READ, mint()).createdOn).toBe(TODAY)
  })

  it('refuses an idea the model would refuse, rather than storing it', () => {
    // Built through the same constructors a form uses, so a shipped idea that is wrong fails
    // here instead of halfway into storage.
    const broken: HabitIdea = { ...WATER, minimum: 5, goal: 1 }

    expect(() => habitFromIdea(broken, mint())).toThrow(InvalidMeasureError)
  })
})

describe('whether an idea is already being tracked', () => {
  it('says so when a habit answers to that name', () => {
    expect(alreadyTracked([habitNamed('Read')], READ)).toBe(true)
  })

  it('matches the way a person would, ignoring case and stray spacing', () => {
    expect(alreadyTracked([habitNamed('  read ')], READ)).toBe(true)
  })

  it('says nothing of a name that is not there', () => {
    expect(alreadyTracked([habitNamed('Run')], READ)).toBe(false)
  })

  it('counts a habit you are quitting, unlike the routine presets', () => {
    // Those reuse only habits that can be performed, because a routine step is a thing you
    // do. This only answers "have you got this already", and two called "Smoking" would be
    // as confusing as two called "Read".
    const smoking = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: EARLIER,
    })

    expect(alreadyTracked([smoking], SMOKING)).toBe(true)
  })

  it('does not count an archived habit, so a fresh start is still offered', () => {
    // Greying out an idea because of a habit retired last year would be refusing to offer a
    // fresh start on the grounds that you once gave up.
    const retired = archiveHabit(habitNamed('Read'), calendarDate('2026-01-01'))

    expect(alreadyTracked([retired], READ)).toBe(false)
  })
})

describe('flattening the library', () => {
  it('returns every idea across the headings', () => {
    const categories = [
      { key: 'a', name: 'A', ideas: [READ] },
      { key: 'b', name: 'B', ideas: [WATER, SMOKING] },
    ]

    expect(allIdeas(categories)).toEqual([READ, WATER, SMOKING])
  })
})

describe('the reason an idea gives', () => {
  it('travels onto the habit, rather than being thrown away on the way in', () => {
    // The whole point of the list saying why rather than only what. Keeping the noun and
    // dropping the reason leaves the app unable to answer what it had just answered for you.
    expect(habitFromIdea(READ, mint()).description).toBe(READ.why)
  })

  it('travels for a habit you are quitting too', () => {
    expect(habitFromIdea(SMOKING, mint()).description).toBe(SMOKING.why)
  })

  it('travels for a measured one', () => {
    expect(habitFromIdea(WATER, mint()).description).toBe(WATER.why)
  })
})
