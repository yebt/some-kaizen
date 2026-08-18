import { describe, expect, it } from 'vitest'

import {
  addMinutes,
  endOf,
  formatTime,
  InvalidTimeOfDayError,
  InvalidTimeIntervalError,
  interval,
  intervalsOverlap,
  parseTime,
  segmentsOf,
  snapToStep,
  spanBetween,
  timeOfDay,
  wrapsMidnight,
} from './time-of-day'

describe('timeOfDay', () => {
  it('accepts midnight and the last minute of the day', () => {
    expect(timeOfDay(0)).toBe(0)
    expect(timeOfDay(1439)).toBe(1439)
  })

  it.each([-1, 1440, 5.5, Number.NaN])('rejects the out of range value %s', (value) => {
    expect(() => timeOfDay(value)).toThrow(InvalidTimeOfDayError)
  })
})

describe('parseTime', () => {
  it('reads a 24 hour clock string as minutes from midnight', () => {
    expect(parseTime('00:00')).toBe(0)
    expect(parseTime('07:30')).toBe(450)
    expect(parseTime('23:59')).toBe(1439)
  })

  it.each(['7:30', '07:60', '24:00', '0730', ''])('rejects the malformed value %s', (value) => {
    expect(() => parseTime(value)).toThrow(InvalidTimeOfDayError)
  })
})

describe('formatTime', () => {
  it('renders a zero padded 24 hour clock string', () => {
    expect(formatTime(timeOfDay(0))).toBe('00:00')
    expect(formatTime(timeOfDay(450))).toBe('07:30')
    expect(formatTime(timeOfDay(1439))).toBe('23:59')
  })

  it('renders a 12 hour clock when asked', () => {
    expect(formatTime(timeOfDay(0), { hour12: true })).toBe('12:00 AM')
    expect(formatTime(timeOfDay(450), { hour12: true })).toBe('7:30 AM')
    expect(formatTime(timeOfDay(720), { hour12: true })).toBe('12:00 PM')
    expect(formatTime(timeOfDay(1290), { hour12: true })).toBe('9:30 PM')
  })

  it('formats minutes past the end of the day back onto the clock', () => {
    // 08:00 the next morning, reached from a block that started the evening before.
    expect(formatTime(1920)).toBe('08:00')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    'rejects the non finite value %s instead of rendering it',
    (value) => {
      // Rendering "NaN:NaN" into the timeline hides the corruption; throwing lets the
      // caller fall back to something honest.
      expect(() => formatTime(value)).toThrow(InvalidTimeOfDayError)
    },
  )
})

describe('addMinutes', () => {
  it('advances within the same day', () => {
    expect(addMinutes(timeOfDay(450), 45)).toBe(495)
  })

  it('wraps around midnight', () => {
    expect(addMinutes(timeOfDay(1410), 60)).toBe(30)
  })

  it('wraps backwards past midnight', () => {
    expect(addMinutes(timeOfDay(30), -60)).toBe(1410)
  })
})

describe('snapToStep', () => {
  it('snaps to the nearest step, which is what a dragged block needs', () => {
    expect(snapToStep(462, 15)).toBe(465)
    expect(snapToStep(455, 15)).toBe(450)
  })

  it('keeps an already aligned value untouched', () => {
    expect(snapToStep(450, 15)).toBe(450)
  })

  it('clamps a snap that would land past the end of the day', () => {
    expect(snapToStep(1438, 15)).toBe(1439)
  })
})

describe('interval', () => {
  it('builds an interval from a start and a duration', () => {
    expect(interval(timeOfDay(540), 90)).toEqual({ start: 540, durationMinutes: 90 })
  })

  it.each([0, -30])('rejects the non positive duration %s', (duration) => {
    expect(() => interval(timeOfDay(540), duration)).toThrow(InvalidTimeIntervalError)
  })

  it('rejects a duration longer than a full day', () => {
    expect(() => interval(timeOfDay(0), 1441)).toThrow(InvalidTimeIntervalError)
  })

  it('allows a duration of exactly one day', () => {
    expect(interval(timeOfDay(0), 1440)).toEqual({ start: 0, durationMinutes: 1440 })
  })
})

describe('spanBetween', () => {
  it('measures a span that stays inside the day', () => {
    expect(spanBetween(timeOfDay(540), timeOfDay(1020))).toEqual({
      start: 540,
      durationMinutes: 480,
    })
  })

  it('reads an earlier end as the following morning, which is what sleep means', () => {
    expect(spanBetween(timeOfDay(1380), timeOfDay(420))).toEqual({
      start: 1380,
      durationMinutes: 480,
    })
  })

  it('treats equal times as a full day rather than an empty one', () => {
    expect(spanBetween(timeOfDay(540), timeOfDay(540)).durationMinutes).toBe(1440)
  })

  it('handles a span ending exactly at midnight', () => {
    expect(spanBetween(timeOfDay(1380), timeOfDay(0)).durationMinutes).toBe(60)
  })

  it('produces a span its own end agrees with', () => {
    const span = spanBetween(timeOfDay(1380), timeOfDay(420))

    expect(endOf(span)).toBe(420)
  })
})

describe('endOf', () => {
  it('returns the wall clock end of an interval inside the day', () => {
    expect(endOf(interval(timeOfDay(540), 90))).toBe(630)
  })

  it('returns the wall clock end of an interval crossing midnight', () => {
    expect(endOf(interval(timeOfDay(1380), 480))).toBe(420)
  })
})

describe('wrapsMidnight', () => {
  it('is false for an interval contained in the day', () => {
    expect(wrapsMidnight(interval(timeOfDay(540), 90))).toBe(false)
  })

  it('is true for a night shift such as sleep', () => {
    expect(wrapsMidnight(interval(timeOfDay(1380), 480))).toBe(true)
  })

  it('is false for an interval ending exactly at midnight', () => {
    expect(wrapsMidnight(interval(timeOfDay(1380), 60))).toBe(false)
  })
})

describe('segmentsOf', () => {
  it('returns a single segment for an interval inside the day', () => {
    expect(segmentsOf(interval(timeOfDay(540), 90))).toEqual([{ from: 540, to: 630 }])
  })

  it('splits an interval crossing midnight into an evening and a morning segment', () => {
    expect(segmentsOf(interval(timeOfDay(1380), 480))).toEqual([
      { from: 1380, to: 1440 },
      { from: 0, to: 420 },
    ])
  })
})

describe('intervalsOverlap', () => {
  it('detects a plain overlap', () => {
    expect(intervalsOverlap(interval(timeOfDay(540), 120), interval(timeOfDay(600), 60))).toBe(true)
  })

  it('treats touching intervals as free of overlap', () => {
    // 09:00-10:00 followed by 10:00-11:00 is a legal back to back schedule.
    expect(intervalsOverlap(interval(timeOfDay(540), 60), interval(timeOfDay(600), 60))).toBe(false)
  })

  it('detects containment in either direction', () => {
    const outer = interval(timeOfDay(540), 240)
    const inner = interval(timeOfDay(600), 30)

    expect(intervalsOverlap(outer, inner)).toBe(true)
    expect(intervalsOverlap(inner, outer)).toBe(true)
  })

  it('detects an overlap with a block that crossed midnight', () => {
    const sleep = interval(timeOfDay(1380), 480) // 23:00 -> 07:00
    const earlyWork = interval(timeOfDay(360), 120) // 06:00 -> 08:00

    expect(intervalsOverlap(sleep, earlyWork)).toBe(true)
  })

  it('detects an evening overlap with a block that crossed midnight', () => {
    const sleep = interval(timeOfDay(1380), 480) // 23:00 -> 07:00
    const lateCall = interval(timeOfDay(1350), 60) // 22:30 -> 23:30

    expect(intervalsOverlap(sleep, lateCall)).toBe(true)
  })

  it('clears a block that fits entirely in the waking gap', () => {
    const sleep = interval(timeOfDay(1380), 480) // 23:00 -> 07:00
    const work = interval(timeOfDay(540), 480) // 09:00 -> 17:00

    expect(intervalsOverlap(sleep, work)).toBe(false)
  })

  it('detects an overlap between two intervals that both cross midnight', () => {
    expect(intervalsOverlap(interval(timeOfDay(1380), 480), interval(timeOfDay(1410), 300))).toBe(
      true,
    )
  })

  it('reports an overlap for a full day interval against anything', () => {
    expect(intervalsOverlap(interval(timeOfDay(0), 1440), interval(timeOfDay(720), 30))).toBe(true)
  })
})
