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
  currentEntries,
  entriesByDate,
  EntryTooEarlyError,
  latestEntryFor,
  latestEntryForInstance,
  pendingNegativeChecks,
  recordCompleted,
  recordMeasured,
  recordNegative,
  InvalidNoteError,
  JUDGEABLE_DAYS,
  MAX_NOTE_LENGTH,
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

  it('asks about every finished day inside the window, newest first', () => {
    // Yesterday is the one that can actually be answered, so it comes first.
    expect(pendingNegativeChecks(smoking, [], today)).toEqual([
      '2026-03-04',
      '2026-03-03',
      '2026-03-02',
      '2026-03-01',
    ])
  })

  it('stops asking about days too old to remember', () => {
    // A verdict invented months later is a guess sitting in the same column as a
    // measurement. The heatmap already draws an unanswered day apart from a failed one.
    const ancient = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: calendarDate('2025-01-01'),
    })

    const asked = pendingNegativeChecks(ancient, [], today)

    expect(asked).toHaveLength(JUDGEABLE_DAYS)
    expect(asked[0]).toBe('2026-03-04')
  })

  it('honours a narrower window when one is asked for', () => {
    expect(pendingNegativeChecks(smoking, [], today, 2)).toEqual(['2026-03-04', '2026-03-03'])
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
      '2026-03-04',
      '2026-03-03',
      '2026-03-01',
    ])
  })

  it('asks nothing on the day the habit was created', () => {
    expect(pendingNegativeChecks(smoking, [], CREATED_ON)).toEqual([])
  })

  it('stops asking after the habit was archived', () => {
    const archived = { ...smoking, archivedOn: calendarDate('2026-03-02') }

    expect(pendingNegativeChecks(archived, [], today)).toEqual(['2026-03-02', '2026-03-01'])
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

describe('latestEntryFor ordering', () => {
  it('picks the newest verdict even when the list arrives in another order', () => {
    // Storage hands back rows keyed by identifier, which for a UUID is effectively random,
    // so the newest entry is not the last element.
    const day = calendarDate('2026-03-04')
    const older = recordCompleted(newIdentifier(), meditate, day, true, { recordedAt: 100 })
    const newer = recordCompleted(newIdentifier(), meditate, day, false, { recordedAt: 200 })

    expect(latestEntryFor([newer, older], meditate.id, day)).toBe(newer)
    expect(latestEntryFor([older, newer], meditate.id, day)).toBe(newer)
  })
})

describe('latestEntryForInstance', () => {
  const day = calendarDate('2026-03-04')
  const morning = newIdentifier()
  const evening = newIdentifier()

  it('keeps two occurrences of the same habit on one day apart', () => {
    // A habit asking for three sessions a day could never be met if one day held one answer.
    const first = recordCompleted(newIdentifier(), meditate, day, true, { instanceId: morning })
    const second = recordCompleted(newIdentifier(), meditate, day, false, { instanceId: evening })

    expect(latestEntryForInstance([first, second], morning)?.outcome).toBe('done')
    expect(latestEntryForInstance([first, second], evening)?.outcome).toBe('missed')
  })

  it('takes the newest verdict for that occurrence', () => {
    const older = recordCompleted(newIdentifier(), meditate, day, true, {
      instanceId: morning,
      recordedAt: 100,
    })
    const newer = recordCompleted(newIdentifier(), meditate, day, false, {
      instanceId: morning,
      recordedAt: 200,
    })

    expect(latestEntryForInstance([newer, older], morning)).toBe(newer)
  })

  it('is undefined for an occurrence nobody answered', () => {
    expect(latestEntryForInstance([], morning)).toBeUndefined()
  })

  it('ignores an entry that answers the day rather than an occurrence', () => {
    const dayLevel = recordCompleted(newIdentifier(), meditate, day, true)

    expect(latestEntryForInstance([dayLevel], morning)).toBeUndefined()
  })
})

describe('currentEntries', () => {
  const day = calendarDate('2026-03-04')

  it('keeps only the verdict that still stands for a day', () => {
    const older = recordCompleted(newIdentifier(), meditate, day, true, { recordedAt: 100 })
    const newer = recordCompleted(newIdentifier(), meditate, day, false, { recordedAt: 200 })

    expect(currentEntries([newer, older])).toEqual([newer])
  })

  it('keeps one verdict per occurrence rather than per day', () => {
    const morning = newIdentifier()
    const evening = newIdentifier()
    const first = recordCompleted(newIdentifier(), meditate, day, true, { instanceId: morning })
    const second = recordCompleted(newIdentifier(), meditate, day, true, { instanceId: evening })

    expect(currentEntries([first, second])).toHaveLength(2)
  })

  it('does not merge two habits answered on the same day', () => {
    const mine = recordCompleted(newIdentifier(), meditate, day, true)
    const other = recordMeasured(newIdentifier(), water, day, 1)

    expect(currentEntries([mine, other])).toHaveLength(2)
  })

  it('keeps only the newest verdict for a negative habit day', () => {
    const older = recordNegative(
      newIdentifier(),
      smoking,
      day,
      'avoided',
      calendarDate('2026-03-05'),
      { recordedAt: 100 },
    )
    const newer = recordNegative(
      newIdentifier(),
      smoking,
      day,
      'relapsed',
      calendarDate('2026-03-05'),
      { recordedAt: 200 },
    )

    expect(currentEntries([newer, older])).toEqual([newer])
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

describe('a note about the day', () => {
  const habit = createCompletedHabit({
    id: newIdentifier(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: calendarDate('2020-01-01'),
  })

  const DAY = calendarDate('2026-03-11')

  it('is kept alongside the outcome', () => {
    const entry = recordCompleted(newIdentifier(), habit, DAY, true, { note: 'Before the call' })

    expect(entry.note).toBe('Before the call')
  })

  it('is absent when nobody wrote one', () => {
    expect(recordCompleted(newIdentifier(), habit, DAY, true).note).toBeUndefined()
  })

  it('treats whitespace as no note at all', () => {
    // An empty string and an absent field mean the same thing and compare as different,
    // which is exactly the difference a merge reports as a conflict nobody caused.
    expect(recordCompleted(newIdentifier(), habit, DAY, true, { note: '   ' }).note).toBeUndefined()
  })

  it('trims what it keeps', () => {
    const entry = recordCompleted(newIdentifier(), habit, DAY, true, { note: '  late  ' })

    expect(entry.note).toBe('late')
  })

  it('refuses one longer than a note should be', () => {
    expect(() =>
      recordCompleted(newIdentifier(), habit, DAY, true, { note: 'x'.repeat(MAX_NOTE_LENGTH + 1) }),
    ).toThrow(InvalidNoteError)
  })

  it('accepts one exactly at the limit', () => {
    const note = 'x'.repeat(MAX_NOTE_LENGTH)

    expect(recordCompleted(newIdentifier(), habit, DAY, true, { note }).note).toBe(note)
  })
})
