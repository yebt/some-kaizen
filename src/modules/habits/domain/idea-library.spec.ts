import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { MAX_HABIT_NAME_LENGTH, normalisedName } from './habit'
import { allIdeas, habitFromIdea } from './habit-ideas'
import { HABIT_IDEAS } from './idea-library'

/**
 * The bundled library is data, and data that ships is code that has not been run.
 *
 * An idea whose goal sits below its minimum, or whose weekday list is empty, would pass every
 * type check and every test of `habitFromIdea`, then throw in front of a real person on the
 * one screen that exists so a beginner is not staring at an empty list.
 */
const TODAY = calendarDate('2026-03-11')

const EVERY = allIdeas(HABIT_IDEAS).map((idea) => [idea.name, idea] as const)

describe('every bundled idea', () => {
  it.each(EVERY)('%s becomes a habit the model accepts', (_name, idea) => {
    expect(() => habitFromIdea(idea, { id: newIdentifier(), today: TODAY })).not.toThrow()
  })

  it.each(EVERY)('%s says what it is and why it is worth doing', (_name, idea) => {
    expect(idea.name.trim()).not.toBe('')
    expect(idea.name.length).toBeLessThanOrEqual(MAX_HABIT_NAME_LENGTH)
    // The reason is the half that survives the third week. A list of bare nouns is a list of
    // chores, and chores are what people stop doing.
    expect(idea.why.trim()).not.toBe('')
  })

  it.each(EVERY)('%s keeps its reason to one line', (_name, idea) => {
    expect(idea.why).not.toContain('\n')
    expect(idea.why.length).toBeLessThanOrEqual(90)
  })
})

describe('the library as a whole', () => {
  it('names every idea only once, however many headings there are', () => {
    // A duplicate would offer the same habit twice and mark both as tracked after either is
    // taken, which reads as the list being broken.
    const names = allIdeas(HABIT_IDEAS).map((idea) => normalisedName(idea.name))

    expect(new Set(names).size).toBe(names.length)
  })

  it('addresses each heading by a key that cannot collide', () => {
    const keys = HABIT_IDEAS.map((category) => category.key)

    expect(new Set(keys).size).toBe(keys.length)
  })

  it('has no empty heading, which would read as a section that failed to load', () => {
    for (const category of HABIT_IDEAS) {
      expect(category.name.trim()).not.toBe('')
      expect(category.ideas.length).toBeGreaterThan(0)
    }
  })

  it('offers something to quit as well as things to build', () => {
    // The app models both, and a list of only positive habits would quietly say it does not.
    expect(allIdeas(HABIT_IDEAS).some((idea) => idea.kind === 'negative')).toBe(true)
  })

  it('offers a measured one, so the shape is discoverable at all', () => {
    expect(allIdeas(HABIT_IDEAS).some((idea) => idea.kind === 'measured')).toBe(true)
  })

  it('stays short enough to read rather than becoming a catalogue', () => {
    // A list nobody finishes reading is a menu, and a menu is where the blank page comes back.
    expect(allIdeas(HABIT_IDEAS).length).toBeLessThanOrEqual(30)
    expect(HABIT_IDEAS.length).toBeLessThanOrEqual(6)
  })
})
