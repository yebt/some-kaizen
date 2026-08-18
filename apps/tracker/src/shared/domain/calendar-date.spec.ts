import { describe, expect, it } from 'vitest'

import {
  addDays,
  calendarDate,
  compareDates,
  differenceInDays,
  eachDayBetween,
  endOfMonth,
  endOfWeek,
  endOfYear,
  fromDate,
  InvalidCalendarDateError,
  InvalidDayOffsetError,
  isAfter,
  isBefore,
  isoWeekKey,
  monthKey,
  startOfMonth,
  startOfWeek,
  startOfYear,
  toDate,
  todayIn,
  weekday,
  yearKey,
} from './calendar-date'

describe('calendarDate', () => {
  it('accepts a well formed ISO date', () => {
    expect(calendarDate('2026-03-11')).toBe('2026-03-11')
  })

  it.each(['2026-3-11', '11-03-2026', '2026-03-11T00:00:00', '', 'nope'])(
    'rejects the malformed value %s',
    (value) => {
      expect(() => calendarDate(value)).toThrow(InvalidCalendarDateError)
    },
  )

  it.each(['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31'])(
    'rejects the impossible date %s',
    (value) => {
      expect(() => calendarDate(value)).toThrow(InvalidCalendarDateError)
    },
  )

  it('accepts a leap day on a leap year', () => {
    expect(calendarDate('2024-02-29')).toBe('2024-02-29')
  })

  it('rejects a leap day on a common year', () => {
    expect(() => calendarDate('2026-02-29')).toThrow(InvalidCalendarDateError)
  })
})

describe('fromDate', () => {
  it('reads the local calendar fields rather than the UTC ones', () => {
    // 23:30 local on the 11th stays the 11th regardless of the UTC offset.
    const local = new Date(2026, 2, 11, 23, 30)

    expect(fromDate(local)).toBe('2026-03-11')
  })

  it('pads single digit months and days', () => {
    expect(fromDate(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

describe('todayIn', () => {
  it('derives the calendar date from the provided clock reading', () => {
    expect(todayIn(new Date(2026, 7, 10, 6, 0))).toBe('2026-08-10')
  })
})

describe('toDate', () => {
  it('returns a local midnight Date for the calendar date', () => {
    const date = toDate(calendarDate('2026-03-11'))

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(11)
    expect(date.getHours()).toBe(0)
  })

  it('round trips through fromDate', () => {
    expect(fromDate(toDate(calendarDate('2026-12-31')))).toBe('2026-12-31')
  })
})

describe('addDays', () => {
  it('moves forward inside the same month', () => {
    expect(addDays(calendarDate('2026-03-11'), 3)).toBe('2026-03-14')
  })

  it('moves backwards across a month boundary', () => {
    expect(addDays(calendarDate('2026-03-01'), -1)).toBe('2026-02-28')
  })

  it('crosses a year boundary', () => {
    expect(addDays(calendarDate('2026-12-31'), 1)).toBe('2027-01-01')
  })

  it('handles the leap day when stepping through February', () => {
    expect(addDays(calendarDate('2024-02-28'), 1)).toBe('2024-02-29')
    expect(addDays(calendarDate('2026-02-28'), 1)).toBe('2026-03-01')
  })

  it('is unaffected by daylight saving transitions', () => {
    // Spanning a typical DST jump must still advance exactly one calendar day.
    expect(addDays(calendarDate('2026-03-28'), 1)).toBe('2026-03-29')
    expect(addDays(calendarDate('2026-10-24'), 1)).toBe('2026-10-25')
  })

  it('returns the same date when adding zero', () => {
    expect(addDays(calendarDate('2026-03-11'), 0)).toBe('2026-03-11')
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5])(
    'rejects the offset %s instead of producing a corrupt date',
    (amount) => {
      expect(() => addDays(calendarDate('2026-03-11'), amount)).toThrow(InvalidDayOffsetError)
    },
  )

  it('never returns a value that its own parser would reject', () => {
    // The brand promises the string is a real date; a silent NaN would break that promise
    // and then travel undetected through every streak calculation downstream.
    const result = addDays(calendarDate('2026-03-11'), 400)

    expect(() => calendarDate(result)).not.toThrow()
  })
})

describe('isBefore', () => {
  it('is true only when the first date is strictly earlier', () => {
    expect(isBefore(calendarDate('2026-03-11'), calendarDate('2026-03-14'))).toBe(true)
    expect(isBefore(calendarDate('2026-03-14'), calendarDate('2026-03-11'))).toBe(false)
    expect(isBefore(calendarDate('2026-03-11'), calendarDate('2026-03-11'))).toBe(false)
  })
})

describe('isAfter', () => {
  it('is true only when the first date is strictly later', () => {
    expect(isAfter(calendarDate('2026-03-14'), calendarDate('2026-03-11'))).toBe(true)
    expect(isAfter(calendarDate('2026-03-11'), calendarDate('2026-03-14'))).toBe(false)
    expect(isAfter(calendarDate('2026-03-11'), calendarDate('2026-03-11'))).toBe(false)
  })
})

describe('startOfMonth', () => {
  it('snaps to the first day of the month', () => {
    expect(startOfMonth(calendarDate('2026-03-11'))).toBe('2026-03-01')
  })

  it('returns the same date when it is already the first', () => {
    expect(startOfMonth(calendarDate('2026-03-01'))).toBe('2026-03-01')
  })
})

describe('endOfMonth', () => {
  it('returns the last day of a 31 day month', () => {
    expect(endOfMonth(calendarDate('2026-03-11'))).toBe('2026-03-31')
  })

  it('returns the last day of a 30 day month', () => {
    expect(endOfMonth(calendarDate('2026-04-11'))).toBe('2026-04-30')
  })

  it('returns the 28th for February on a common year', () => {
    expect(endOfMonth(calendarDate('2026-02-11'))).toBe('2026-02-28')
  })

  it('returns the 29th for February on a leap year', () => {
    expect(endOfMonth(calendarDate('2024-02-11'))).toBe('2024-02-29')
  })

  it('returns the last day of December without spilling into the next year', () => {
    expect(endOfMonth(calendarDate('2026-12-05'))).toBe('2026-12-31')
  })
})

describe('startOfYear', () => {
  it('snaps to the first of January', () => {
    expect(startOfYear(calendarDate('2026-03-11'))).toBe('2026-01-01')
  })
})

describe('endOfYear', () => {
  it('snaps to the last of December', () => {
    expect(endOfYear(calendarDate('2026-03-11'))).toBe('2026-12-31')
  })
})

describe('eachDayBetween', () => {
  it('includes both ends of the range', () => {
    expect(eachDayBetween(calendarDate('2026-03-11'), calendarDate('2026-03-14'))).toEqual([
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
    ])
  })

  it('returns a single day when both ends are the same date', () => {
    expect(eachDayBetween(calendarDate('2026-03-11'), calendarDate('2026-03-11'))).toEqual([
      '2026-03-11',
    ])
  })

  it('returns nothing when the range runs backwards', () => {
    expect(eachDayBetween(calendarDate('2026-03-14'), calendarDate('2026-03-11'))).toEqual([])
  })

  it('walks across a month boundary', () => {
    expect(eachDayBetween(calendarDate('2026-02-27'), calendarDate('2026-03-02'))).toEqual([
      '2026-02-27',
      '2026-02-28',
      '2026-03-01',
      '2026-03-02',
    ])
  })

  it('spans a full common year day by day', () => {
    const days = eachDayBetween(calendarDate('2026-01-01'), calendarDate('2026-12-31'))

    expect(days).toHaveLength(365)
  })
})

describe('differenceInDays', () => {
  it('counts whole days between two dates', () => {
    expect(differenceInDays(calendarDate('2026-03-14'), calendarDate('2026-03-11'))).toBe(3)
  })

  it('is negative when the first date is earlier', () => {
    expect(differenceInDays(calendarDate('2026-03-11'), calendarDate('2026-03-14'))).toBe(-3)
  })

  it('counts across a DST boundary without drifting', () => {
    expect(differenceInDays(calendarDate('2026-04-01'), calendarDate('2026-03-01'))).toBe(31)
  })
})

describe('compareDates', () => {
  it('orders dates chronologically', () => {
    const dates = [
      calendarDate('2026-03-14'),
      calendarDate('2025-12-01'),
      calendarDate('2026-01-09'),
    ]

    expect([...dates].sort(compareDates)).toEqual(['2025-12-01', '2026-01-09', '2026-03-14'])
  })

  it('returns zero for the same date', () => {
    expect(compareDates(calendarDate('2026-03-11'), calendarDate('2026-03-11'))).toBe(0)
  })
})

describe('weekday', () => {
  it('numbers Monday as 1 through Sunday as 7', () => {
    expect(weekday(calendarDate('2026-03-09'))).toBe(1)
    expect(weekday(calendarDate('2026-03-15'))).toBe(7)
  })
})

describe('startOfWeek', () => {
  it('snaps to the preceding Monday by default', () => {
    expect(startOfWeek(calendarDate('2026-03-11'))).toBe('2026-03-09')
  })

  it('returns the same date when it is already a Monday', () => {
    expect(startOfWeek(calendarDate('2026-03-09'))).toBe('2026-03-09')
  })

  it('snaps to Sunday when the week starts on Sunday', () => {
    expect(startOfWeek(calendarDate('2026-03-11'), 7)).toBe('2026-03-08')
  })
})

describe('endOfWeek', () => {
  it('returns the Sunday closing a Monday based week', () => {
    expect(endOfWeek(calendarDate('2026-03-11'))).toBe('2026-03-15')
  })

  it('returns the Saturday closing a Sunday based week', () => {
    expect(endOfWeek(calendarDate('2026-03-11'), 7)).toBe('2026-03-14')
  })
})

describe('isoWeekKey', () => {
  it('builds a sortable ISO week key', () => {
    expect(isoWeekKey(calendarDate('2026-03-11'))).toBe('2026-W11')
  })

  it('assigns early January days to the previous ISO year when they belong to it', () => {
    // 2027-01-01 is a Friday, so it belongs to ISO week 53 of 2026.
    expect(isoWeekKey(calendarDate('2027-01-01'))).toBe('2026-W53')
  })

  it('assigns late December days to the next ISO year when they belong to it', () => {
    // 2024-12-30 is a Monday opening ISO week 1 of 2025.
    expect(isoWeekKey(calendarDate('2024-12-30'))).toBe('2025-W01')
  })

  it('gives every day of the same week an identical key', () => {
    const keys = ['2026-03-09', '2026-03-12', '2026-03-15'].map((value) =>
      isoWeekKey(calendarDate(value)),
    )

    expect(new Set(keys).size).toBe(1)
  })
})

describe('monthKey', () => {
  it('builds a sortable month key', () => {
    expect(monthKey(calendarDate('2026-03-11'))).toBe('2026-03')
  })
})

describe('yearKey', () => {
  it('builds a sortable year key', () => {
    expect(yearKey(calendarDate('2026-03-11'))).toBe('2026')
  })
})
