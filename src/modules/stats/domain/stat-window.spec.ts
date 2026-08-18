import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'

import {
  DEFAULT_STAT_WINDOW,
  rangeFor,
  STAT_WINDOWS,
  statWindow,
  windowStartFrom,
} from './stat-window'

const TODAY = calendarDate('2026-03-30')
const LONG_AGO = calendarDate('2020-01-01')

describe('the windows offered', () => {
  it('includes the whole history as one of them', () => {
    expect(STAT_WINDOWS.some((window) => window.days === undefined)).toBe(true)
  })

  it('defaults to one that can actually have moved recently', () => {
    // A year is the wrong default: it barely shifts, so the screen looks the same every time
    // you open it and stops being worth opening.
    expect(statWindow(DEFAULT_STAT_WINDOW).days).toBe(30)
  })

  it('falls back rather than returning nothing for a key it does not know', () => {
    expect(statWindow('nonsense' as never)).toBeDefined()
  })
})

describe('where a window starts', () => {
  it('reaches back its own length, counting today as the first day', () => {
    // Seven days ending today is today and the six before it. Reaching back a full seven
    // would be eight days of history under a label that says seven.
    expect(windowStartFrom(statWindow('7d'), TODAY, LONG_AGO)).toBe(calendarDate('2026-03-24'))
  })

  it('reaches the beginning of the history for the whole span', () => {
    expect(windowStartFrom(statWindow('all'), TODAY, LONG_AGO)).toBe(LONG_AGO)
  })

  it('never reaches back further than the history goes', () => {
    // Otherwise a rate is divided by days that could not have been answered, and a new
    // user's first week reads as a failure at the moment they most need it not to.
    const startedRecently = calendarDate('2026-03-28')

    expect(windowStartFrom(statWindow('90d'), TODAY, startedRecently)).toBe(startedRecently)
  })

  it('leaves a window alone when the history is longer than it', () => {
    expect(windowStartFrom(statWindow('30d'), TODAY, LONG_AGO)).toBe(calendarDate('2026-03-01'))
  })
})

describe('the span a window covers', () => {
  it('ends today for every window counted back from it', () => {
    expect(rangeFor(statWindow('30d'), TODAY, LONG_AGO)).toEqual({
      from: calendarDate('2026-03-01'),
      to: TODAY,
    })
  })

  it('takes both ends from the chooser when the window is a chosen one', () => {
    expect(
      rangeFor(statWindow('custom'), TODAY, LONG_AGO, {
        from: calendarDate('2026-03-01'),
        to: calendarDate('2026-03-15'),
      }),
    ).toEqual({ from: calendarDate('2026-03-01'), to: calendarDate('2026-03-15') })
  })

  it('reads ends given the wrong way round as the span between them', () => {
    // Two date fields invite it, the meaning is unambiguous, and refusing would be the app
    // being pedantic about something it understood perfectly.
    expect(
      rangeFor(statWindow('custom'), TODAY, LONG_AGO, {
        from: calendarDate('2026-03-15'),
        to: calendarDate('2026-03-01'),
      }),
    ).toEqual({ from: calendarDate('2026-03-01'), to: calendarDate('2026-03-15') })
  })

  it('never starts before the history does', () => {
    const started = calendarDate('2026-03-10')

    expect(
      rangeFor(statWindow('custom'), TODAY, started, { from: calendarDate('2020-01-01') }).from,
    ).toBe(started)
  })

  it('never ends after today, so a rate cannot fall on days nobody could answer', () => {
    // A window left open into next month would report a completion rate dropping every
    // morning, for days that have not happened.
    expect(
      rangeFor(statWindow('custom'), TODAY, LONG_AGO, { to: calendarDate('2027-01-01') }).to,
    ).toBe(TODAY)
  })

  it('falls back to the whole history when neither end is chosen', () => {
    expect(rangeFor(statWindow('custom'), TODAY, LONG_AGO)).toEqual({ from: LONG_AGO, to: TODAY })
  })
})
