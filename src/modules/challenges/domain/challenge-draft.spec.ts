import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'

import { InvalidChallengeError } from './challenge'
import { challengeFromNames } from './challenge-draft'

const STARTED_ON = calendarDate('2026-03-01')

function mint() {
  return { id: newIdentifier(), newTaskId: newIdentifier, startedOn: STARTED_ON }
}

function own(overrides: Partial<Parameters<typeof challengeFromNames>[0]> = {}) {
  return challengeFromNames(
    {
      name: 'Winter build',
      lengthDays: 30,
      onMiss: 'continue',
      taskNames: ['Swim', 'Read'],
      ...overrides,
    },
    mint(),
  )
}

describe('a challenge of your own', () => {
  it('keeps what was typed', () => {
    const challenge = own()

    expect(challenge.name).toBe('Winter build')
    expect(challenge.lengthDays).toBe(30)
    expect(challenge.onMiss).toBe('continue')
    expect(challenge.tasks.map((task) => task.name)).toEqual(['Swim', 'Read'])
  })

  /**
   * An empty row is a row you did not fill in, not a task with no name.
   *
   * A form that offers somewhere to type gets rows that stay blank, and rejecting the whole
   * thing over one of them would be the app refusing to understand something obvious. The
   * model still refuses a challenge with nothing in it at all, which is a different claim.
   */
  it('drops the rows that were left blank', () => {
    const challenge = own({ taskNames: ['Swim', '   ', '', 'Read'] })

    expect(challenge.tasks.map((task) => task.name)).toEqual(['Swim', 'Read'])
  })

  it('refuses one where every row was left blank', () => {
    expect(() => own({ taskNames: ['', '  '] })).toThrow(InvalidChallengeError)
  })

  it('gives every task an identifier of its own, so two of them never share a tick', () => {
    const first = own()
    const second = own()

    const shared = first.tasks.filter((task) => second.tasks.some((other) => other.id === task.id))

    expect(shared).toEqual([])
  })

  it('lets the same thing be asked for twice, which is the typist’s business', () => {
    // Two rows reading "Walk" are two tasks. Deduplicating them would be the app deciding it
    // understood the intent better than the person who typed it.
    const challenge = own({ taskNames: ['Walk', 'Walk'] })

    expect(challenge.tasks).toHaveLength(2)
    expect(challenge.tasks[0]!.id).not.toBe(challenge.tasks[1]!.id)
  })

  it('starts on the day it was made rather than backdating one', () => {
    expect(own().startedOn).toBe(STARTED_ON)
  })

  it('still refuses the shapes the model refuses', () => {
    expect(() => own({ name: '  ' })).toThrow(InvalidChallengeError)
    expect(() => own({ lengthDays: 0 })).toThrow(InvalidChallengeError)
  })
})
