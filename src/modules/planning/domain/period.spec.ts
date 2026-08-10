import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'

import { periodContains, periodKeyFor, periodRangeFor } from './period'

describe('periodKeyFor', () => {
  it('keys a daily period by the day itself', () => {
    expect(periodKeyFor('daily', calendarDate('2026-03-11'))).toBe('2026-03-11')
  })

  it('keys a weekly period by its ISO week', () => {
    expect(periodKeyFor('weekly', calendarDate('2026-03-11'))).toBe('2026-W11')
  })

  it('keys a monthly period by its month', () => {
    expect(periodKeyFor('monthly', calendarDate('2026-03-11'))).toBe('2026-03')
  })

  it('keys a yearly period by its year', () => {
    expect(periodKeyFor('yearly', calendarDate('2026-03-11'))).toBe('2026')
  })

  it('gives every day of the same week one weekly key', () => {
    const keys = ['2026-03-09', '2026-03-12', '2026-03-15'].map((day) =>
      periodKeyFor('weekly', calendarDate(day)),
    )

    expect(new Set(keys).size).toBe(1)
  })

  it('keeps a week spanning new year under a single key', () => {
    // 2026-12-31 and 2027-01-01 sit in the same ISO week, so two sessions planned either
    // side of midnight on new year still count against the same weekly quota.
    expect(periodKeyFor('weekly', calendarDate('2026-12-31'))).toBe(
      periodKeyFor('weekly', calendarDate('2027-01-01')),
    )
  })
})

describe('periodRangeFor', () => {
  it('spans a single day for a daily period', () => {
    expect(periodRangeFor('daily', calendarDate('2026-03-11'))).toEqual({
      start: '2026-03-11',
      end: '2026-03-11',
    })
  })

  it('spans Monday to Sunday for a weekly period', () => {
    expect(periodRangeFor('weekly', calendarDate('2026-03-11'))).toEqual({
      start: '2026-03-09',
      end: '2026-03-15',
    })
  })

  it('spans the whole month for a monthly period', () => {
    expect(periodRangeFor('monthly', calendarDate('2026-02-11'))).toEqual({
      start: '2026-02-01',
      end: '2026-02-28',
    })
  })

  it('spans the whole year for a yearly period', () => {
    expect(periodRangeFor('yearly', calendarDate('2026-03-11'))).toEqual({
      start: '2026-01-01',
      end: '2026-12-31',
    })
  })

  it('produces a range whose every day shares the period key', () => {
    const range = periodRangeFor('weekly', calendarDate('2026-12-31'))

    expect(periodKeyFor('weekly', range.start)).toBe(periodKeyFor('weekly', range.end))
  })
})

describe('periodContains', () => {
  it('accepts a day inside the keyed period', () => {
    expect(periodContains('weekly', '2026-W11', calendarDate('2026-03-12'))).toBe(true)
  })

  it('rejects a day outside the keyed period', () => {
    expect(periodContains('weekly', '2026-W11', calendarDate('2026-03-16'))).toBe(false)
  })

  it('accepts both edges of a monthly period', () => {
    expect(periodContains('monthly', '2026-02', calendarDate('2026-02-01'))).toBe(true)
    expect(periodContains('monthly', '2026-02', calendarDate('2026-02-28'))).toBe(true)
  })
})
