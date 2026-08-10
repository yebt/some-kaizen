import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'

import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  measure,
} from './habit'
import {
  entriesByDate,
  EntryTooEarlyError,
  latestEntryFor,
  pendingNegativeChecks,
  recordCompleted,
  recordMeasured,
  recordNegative,
} from './habit-entry'

const CREATED_ON = calendarDate('2026-03-01')

const meditate = createCompletedHabit({
  id: newIdentifier(),
  name: 'Meditate',
  frequency: frequency('daily', 1),
  createdOn: CREATED_ON,
})

const water = createMeasuredHabit({
  id: newIdentifier(),
  name: 'Drink water',
  frequency: frequency('daily', 1),
  measure: measure('litres', 0.5, 1),
  createdOn: CREATED_ON,
})

const smoking = createNegativeHabit({
  id: newIdentifier(),
  name: 'Smoking',
  createdOn: CREATED_ON,
})

describe('recordCompleted', () => {
  it('records a binary habit as done', () => {
    const entry = recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-05'), true)

    expect(entry.outcome).toBe('done')
    expect(entry.kind).toBe('positive')
  })

  it('records a binary habit as missed', () => {
    const entry = recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-05'), false)

    expect(entry.outcome).toBe('missed')
  })

  it('never produces a partial outcome, because there is no half meditation', () => {
    const outcomes = [true, false].map(
      (done) =>
        recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-05'), done).outcome,
    )

    expect(outcomes).not.toContain('partial')
  })

  it('refuses a day before the habit existed', () => {
    expect(() =>
      recordCompleted(newIdentifier(), meditate, calendarDate('2026-02-28'), true),
    ).toThrow(EntryTooEarlyError)
  })
})

describe('recordMeasured', () => {
  it('grades the recorded quantity against the habit thresholds', () => {
    const entry = recordMeasured(newIdentifier(), water, calendarDate('2026-03-05'), 0.75)

    expect(entry.outcome).toBe('partial')
    expect(entry.value).toBe(0.75)
  })

  it('grades a full glass as done', () => {
    expect(recordMeasured(newIdentifier(), water, calendarDate('2026-03-05'), 1.2).outcome).toBe(
      'done',
    )
  })

  it('keeps the raw value alongside the grade, so statistics can show the amount', () => {
    expect(recordMeasured(newIdentifier(), water, calendarDate('2026-03-05'), 0.3).value).toBe(0.3)
  })
})

describe('recordNegative', () => {
  it('records a clean day as avoided', () => {
    const entry = recordNegative(
      newIdentifier(),
      smoking,
      calendarDate('2026-03-05'),
      'avoided',
      calendarDate('2026-03-06'),
    )

    expect(entry.outcome).toBe('avoided')
    expect(entry.date).toBe('2026-03-05')
    expect(entry.recordedOn).toBe('2026-03-06')
  })

  it('records a slip as a relapse', () => {
    const entry = recordNegative(
      newIdentifier(),
      smoking,
      calendarDate('2026-03-05'),
      'relapsed',
      calendarDate('2026-03-06'),
    )

    expect(entry.outcome).toBe('relapsed')
  })

  it('refuses to judge a day before that day is over', () => {
    // The answer is only known once the day has finished, so it is marked the day after.
    expect(() =>
      recordNegative(
        newIdentifier(),
        smoking,
        calendarDate('2026-03-05'),
        'avoided',
        calendarDate('2026-03-05'),
      ),
    ).toThrow(EntryTooEarlyError)
  })

  it('allows catching up on a day judged late', () => {
    const entry = recordNegative(
      newIdentifier(),
      smoking,
      calendarDate('2026-03-05'),
      'relapsed',
      calendarDate('2026-03-12'),
    )

    expect(entry.recordedOn).toBe('2026-03-12')
  })
})

describe('pendingNegativeChecks', () => {
  const today = calendarDate('2026-03-05')

  it('asks about every finished day since the habit was created', () => {
    expect(pendingNegativeChecks(smoking, [], today)).toEqual([
      '2026-03-01',
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
    ])
  })

  it('never asks about today, because today is not over yet', () => {
    expect(pendingNegativeChecks(smoking, [], today)).not.toContain('2026-03-05')
  })

  it('skips days already answered', () => {
    const answered = [
      recordNegative(
        newIdentifier(),
        smoking,
        calendarDate('2026-03-02'),
        'avoided',
        calendarDate('2026-03-03'),
      ),
    ]

    expect(pendingNegativeChecks(smoking, answered, today)).toEqual([
      '2026-03-01',
      '2026-03-03',
      '2026-03-04',
    ])
  })

  it('asks nothing on the day the habit was created', () => {
    expect(pendingNegativeChecks(smoking, [], CREATED_ON)).toEqual([])
  })

  it('stops asking after the habit was archived', () => {
    const archived = { ...smoking, archivedOn: calendarDate('2026-03-02') }

    expect(pendingNegativeChecks(archived, [], today)).toEqual(['2026-03-01', '2026-03-02'])
  })
})

describe('entriesByDate', () => {
  it('indexes entries by the day they describe', () => {
    const entries = [
      recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-04'), true),
      recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-05'), false),
    ]

    expect(entriesByDate(entries).get(calendarDate('2026-03-05'))?.[0]?.outcome).toBe('missed')
  })

  it('groups several entries recorded for the same day', () => {
    const entries = [
      recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-04'), true),
      recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-04'), true),
    ]

    expect(entriesByDate(entries).get(calendarDate('2026-03-04'))).toHaveLength(2)
  })
})

describe('latestEntryFor', () => {
  it('returns the entry describing the given day', () => {
    const entries = [
      recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-04'), true),
      recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-05'), false),
    ]

    expect(latestEntryFor(entries, meditate.id, calendarDate('2026-03-04'))?.outcome).toBe('done')
  })

  it('is undefined when the day has no entry', () => {
    expect(latestEntryFor([], meditate.id, calendarDate('2026-03-04'))).toBeUndefined()
  })

  it('does not confuse one habit with another on the same day', () => {
    const entries = [recordCompleted(newIdentifier(), meditate, calendarDate('2026-03-04'), true)]

    expect(latestEntryFor(entries, water.id, calendarDate('2026-03-04'))).toBeUndefined()
  })
})
