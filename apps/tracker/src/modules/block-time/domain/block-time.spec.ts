import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { interval, timeOfDay } from '@shared/domain/time-of-day'

import {
  addBlock,
  blocksOnDate,
  BlockTimeOverlapError,
  conflictsWith,
  createBlockTime,
  findConflicts,
  InvalidWeekdaysError,
  occupancyOf,
  occupiedMinutesOn,
} from './block-time'

const CREATED_ON = calendarDate('2026-01-01')

function block(name: string, start: number, duration: number, weekdays: number[]) {
  return createBlockTime({
    id: newIdentifier(),
    name,
    span: interval(timeOfDay(start), duration),
    weekdays: weekdays as never,
    createdOn: CREATED_ON,
  })
}

// 23:00 for eight hours, every night of the working week.
const sleep = () => block('Sleep', 1380, 480, [1, 2, 3, 4, 5])
// 09:00 to 17:00, Monday to Friday.
const work = () => block('Work', 540, 480, [1, 2, 3, 4, 5])

describe('createBlockTime', () => {
  it('builds a named activity occupying a span on chosen weekdays', () => {
    const activity = work()

    expect(activity.name).toBe('Work')
    expect(activity.span).toEqual({ start: 540, durationMinutes: 480 })
    expect(activity.weekdays).toEqual([1, 2, 3, 4, 5])
  })

  it('sorts the weekdays so equality and display stay predictable', () => {
    expect(block('Gym', 1080, 60, [5, 1, 3]).weekdays).toEqual([1, 3, 5])
  })

  it('rejects an empty weekday list, which would occupy nothing', () => {
    expect(() => block('Nowhere', 540, 60, [])).toThrow(InvalidWeekdaysError)
  })

  it('rejects a duplicated weekday', () => {
    expect(() => block('Twice', 540, 60, [1, 1])).toThrow(InvalidWeekdaysError)
  })

  it.each([0, 8, -1, 1.5])('rejects the weekday %s', (weekday) => {
    expect(() => block('Bad', 540, 60, [weekday])).toThrow(InvalidWeekdaysError)
  })
})

describe('occupancyOf', () => {
  it('occupies one segment per weekday for a block inside the day', () => {
    expect(occupancyOf(block('Lunch', 720, 60, [1, 2]))).toEqual([
      { weekday: 1, from: 720, to: 780 },
      { weekday: 2, from: 720, to: 780 },
    ])
  })

  it('spills onto the following weekday when the block crosses midnight', () => {
    expect(occupancyOf(block('Sleep', 1380, 480, [1]))).toEqual([
      { weekday: 1, from: 1380, to: 1440 },
      { weekday: 2, from: 0, to: 420 },
    ])
  })

  it('wraps Sunday night onto Monday morning', () => {
    expect(occupancyOf(block('Sleep', 1380, 480, [7]))).toEqual([
      { weekday: 7, from: 1380, to: 1440 },
      { weekday: 1, from: 0, to: 420 },
    ])
  })

  it('does not spill when the block ends exactly at midnight', () => {
    expect(occupancyOf(block('Wind down', 1380, 60, [1]))).toEqual([
      { weekday: 1, from: 1380, to: 1440 },
    ])
  })
})

describe('conflictsWith', () => {
  it('clears two blocks that share a day but not a time', () => {
    expect(conflictsWith(work(), sleep())).toBe(false)
  })

  it('catches two blocks colliding on the same day', () => {
    expect(conflictsWith(work(), block('Meeting', 600, 60, [1]))).toBe(true)
  })

  it('clears blocks that collide in time but never share a day', () => {
    // Identical hours, disjoint weekdays: the weekend job cannot clash with weekday work.
    expect(conflictsWith(work(), block('Weekend job', 540, 480, [6, 7]))).toBe(false)
  })

  it('catches an early block swallowed by the previous night that spilled over', () => {
    // Sleep runs Monday 23:00 to Tuesday 07:00; an early Tuesday start collides with it.
    expect(conflictsWith(sleep(), block('Early shift', 360, 120, [2]))).toBe(true)
  })

  it('catches a late block colliding with the start of the same night', () => {
    expect(conflictsWith(sleep(), block('Late call', 1350, 60, [1]))).toBe(true)
  })

  it('catches a Monday morning block colliding with Sunday night sleep', () => {
    expect(
      conflictsWith(block('Sunday sleep', 1380, 480, [7]), block('Monday gym', 360, 60, [1])),
    ).toBe(true)
  })

  it('treats blocks that merely touch as compatible', () => {
    expect(conflictsWith(block('Morning', 480, 60, [1]), block('Next', 540, 60, [1]))).toBe(false)
  })

  it('is symmetric', () => {
    const early = block('Early shift', 360, 120, [2])

    expect(conflictsWith(sleep(), early)).toBe(conflictsWith(early, sleep()))
  })

  it('ignores a block compared against its own stored copy', () => {
    const existing = work()

    expect(conflictsWith(existing, { ...existing })).toBe(false)
  })
})

describe('self occupancy', () => {
  it('never overlaps itself, even at the maximum length across consecutive days', () => {
    // A block is capped at a full day, so consecutive runs touch but never collide. If this
    // ever became false, every full day block would be unsaveable against itself.
    const slots = occupancyOf(block('Marathon', 720, 1440, [1, 2, 3]))

    const collisions = slots.flatMap((slot, index) =>
      slots
        .slice(index + 1)
        .filter(
          (other) => slot.weekday === other.weekday && slot.from < other.to && other.from < slot.to,
        ),
    )

    expect(collisions).toEqual([])
  })
})

describe('findConflicts', () => {
  it('returns every existing block the candidate collides with', () => {
    const existing = [work(), sleep()]
    const conflicts = findConflicts(block('All nighter', 300, 600, [2]), existing)

    expect(conflicts.map((entry) => entry.name)).toEqual(['Work', 'Sleep'])
  })

  it('returns nothing when the candidate fits in the gaps', () => {
    expect(findConflicts(block('Gym', 1080, 60, [1]), [work(), sleep()])).toEqual([])
  })

  it('ignores the block being edited, so saving it unchanged is not a conflict', () => {
    const existing = work()

    expect(findConflicts(existing, [existing, sleep()])).toEqual([])
  })
})

describe('addBlock', () => {
  it('appends a block that fits', () => {
    const result = addBlock([work()], block('Gym', 1080, 60, [1]))

    expect(result).toHaveLength(2)
  })

  it('refuses a block that would overlap, because block time is the skeleton of the day', () => {
    expect(() => addBlock([work()], block('Meeting', 600, 60, [1]))).toThrow(BlockTimeOverlapError)
  })

  it('names the colliding blocks in the error', () => {
    expect(() => addBlock([work()], block('Meeting', 600, 60, [1]))).toThrow(/Work/)
  })
})

describe('blocksOnDate', () => {
  const monday = calendarDate('2026-03-09')
  const tuesday = calendarDate('2026-03-10')
  const saturday = calendarDate('2026-03-14')

  it('lists the blocks occupying that weekday', () => {
    const occurrences = blocksOnDate([work(), sleep()], monday)

    expect(occurrences.map((entry) => entry.block.name).sort()).toEqual(['Sleep', 'Work'])
  })

  it('includes the morning tail of a block that began the previous night', () => {
    const occurrences = blocksOnDate([sleep()], tuesday)
    const tail = occurrences.find((entry) => entry.continuesFromPreviousDay)

    expect(tail?.segment).toEqual({ from: 0, to: 420 })
  })

  it('marks the evening head of a block that runs into the next day', () => {
    const head = blocksOnDate([sleep()], monday).find((entry) => entry.continuesIntoNextDay)

    expect(head?.segment).toEqual({ from: 1380, to: 1440 })
  })

  it('returns nothing on a day the blocks do not cover', () => {
    expect(blocksOnDate([work()], saturday)).toEqual([])
  })

  it('orders occurrences by when they start, so the timeline reads top to bottom', () => {
    const starts = blocksOnDate([sleep(), work()], tuesday).map((entry) => entry.segment.from)

    expect(starts).toEqual([...starts].sort((left, right) => left - right))
  })

  it('excludes a block archived before that day', () => {
    const archived = { ...work(), archivedOn: calendarDate('2026-03-01') }

    expect(blocksOnDate([archived], monday)).toEqual([])
  })

  it('excludes a block that did not exist yet', () => {
    const later = { ...work(), createdOn: calendarDate('2026-04-01') }

    expect(blocksOnDate([later], monday)).toEqual([])
  })
})

describe('occupiedMinutesOn', () => {
  const monday = calendarDate('2026-03-09')
  const tuesday = calendarDate('2026-03-10')

  it('totals the minutes block time claims from the day', () => {
    // Work is eight hours; Monday also carries the first hour of that night's sleep.
    expect(occupiedMinutesOn([work(), sleep()], monday)).toBe(480 + 60)
  })

  it('counts both ends of a night that wraps around the day', () => {
    // Tuesday holds seven hours of Monday's night, work, and one hour of Tuesday's night.
    expect(occupiedMinutesOn([work(), sleep()], tuesday)).toBe(420 + 480 + 60)
  })

  it('is zero on a day nothing covers', () => {
    expect(occupiedMinutesOn([work()], calendarDate('2026-03-14'))).toBe(0)
  })
})
