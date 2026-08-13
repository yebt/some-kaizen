import type { Appearance } from '@shared/domain/appearance'
import {
  addDays,
  type CalendarDate,
  isAfter,
  isBefore,
  type Weekday,
  weekdaySet,
  weekday,
} from '@shared/domain/calendar-date'
export { InvalidWeekdaysError } from '@shared/domain/calendar-date'

import type { Identifier } from '@shared/domain/identifier'
import { segmentsOf, type TimeInterval, type TimeSegment } from '@shared/domain/time-of-day'

/**
 * A fixed, recurring commitment such as sleep or work.
 *
 * Block time is the skeleton the rest of the day hangs off. Habits may overlap each other
 * freely, but two blocks may never overlap: you cannot be asleep and at work at the same
 * time, and letting that be representable would make the day view lie about how much room
 * is actually left.
 */
export interface BlockTime extends Appearance {
  readonly id: Identifier
  readonly name: string
  readonly span: TimeInterval
  /** ISO weekdays the block recurs on, sorted ascending. */
  readonly weekdays: readonly Weekday[]
  readonly createdOn: CalendarDate
  readonly archivedOn?: CalendarDate
}

/** A stretch of one weekday a block covers, already flattened onto that day. */
export interface WeekdayOccupancy {
  readonly weekday: Weekday
  readonly from: number
  readonly to: number
}

/** A block as it appears on one concrete date in the day view. */
export interface BlockOccurrence {
  readonly block: BlockTime
  readonly segment: TimeSegment
  /** True for the morning tail of a block that started the night before. */
  readonly continuesFromPreviousDay: boolean
  /** True for the evening head of a block that runs past midnight. */
  readonly continuesIntoNextDay: boolean
}

export class BlockTimeOverlapError extends Error {
  constructor(readonly conflicts: readonly BlockTime[]) {
    super(`Block time cannot overlap: conflicts with ${conflicts.map((b) => b.name).join(', ')}.`)
    this.name = 'BlockTimeOverlapError'
  }
}

export interface BlockTimeDraft extends Appearance {
  readonly id: Identifier
  readonly name: string
  readonly span: TimeInterval
  readonly weekdays: readonly Weekday[]
  readonly createdOn: CalendarDate
  /** Kept when editing, so re-saving a retired block does not quietly revive it. */
  readonly archivedOn?: CalendarDate
}

export function createBlockTime(draft: BlockTimeDraft): BlockTime {
  return {
    // Only the parts actually chosen, so an unstyled block stores no empty fields.
    ...(draft.colour ? { colour: draft.colour } : {}),
    ...(draft.pattern ? { pattern: draft.pattern } : {}),
    id: draft.id,
    name: blockName(draft.name),
    span: draft.span,
    weekdays: weekdaySet(draft.weekdays),
    createdOn: draft.createdOn,
    ...(draft.archivedOn ? { archivedOn: draft.archivedOn } : {}),
  }
}

export class InvalidBlockNameError extends Error {
  constructor(readonly value: string) {
    super('A block needs a name.')
    this.name = 'InvalidBlockNameError'
  }
}

function blockName(value: string): string {
  const trimmed = value.trim()

  if (!trimmed) throw new InvalidBlockNameError(value)

  return trimmed
}

/**
 * Every stretch of every weekday the block covers.
 *
 * A block that runs past midnight is recorded against two weekdays, not one. Sleeping from
 * Sunday 23:00 genuinely occupies Monday morning, and a Monday alarm set for 06:00 has to
 * be able to see that. Comparing raw start times would miss it entirely.
 */
export function occupancyOf(block: BlockTime): WeekdayOccupancy[] {
  const segments = segmentsOf(block.span)

  return block.weekdays.flatMap((day) =>
    segments.map((segment, index) => ({
      // The second segment, when present, is always the spill onto the following day.
      weekday: index === 0 ? day : nextWeekday(day),
      from: segment.from,
      to: segment.to,
    })),
  )
}

/** Whether two blocks compete for the same minute of the same weekday. */
export function conflictsWith(block: BlockTime, other: BlockTime): boolean {
  if (block.id === other.id) return false

  const otherOccupancy = occupancyOf(other)

  return occupancyOf(block).some((slot) =>
    otherOccupancy.some(
      (otherSlot) =>
        slot.weekday === otherSlot.weekday && slot.from < otherSlot.to && otherSlot.from < slot.to,
    ),
  )
}

/**
 * Every existing block the candidate collides with.
 *
 * The candidate is matched out by identity, so re-saving an unchanged block does not report
 * it as conflicting with its own stored copy.
 */
export function findConflicts(candidate: BlockTime, existing: readonly BlockTime[]): BlockTime[] {
  return existing.filter((block) => conflictsWith(candidate, block))
}

export function addBlock(existing: readonly BlockTime[], candidate: BlockTime): BlockTime[] {
  const conflicts = findConflicts(candidate, existing)

  if (conflicts.length > 0) throw new BlockTimeOverlapError(conflicts)

  return [...existing, candidate]
}

/**
 * The blocks occupying a concrete date, in the order they appear down the timeline.
 *
 * A single block can appear twice on one date: the tail of last night's sleep in the
 * morning, and the head of tonight's in the evening. Both are real, and the day view has to
 * draw both.
 */
export function blocksOnDate(blocks: readonly BlockTime[], date: CalendarDate): BlockOccurrence[] {
  const today = weekday(date)
  const yesterday = weekday(addDays(date, -1))

  const occurrences = blocks
    .filter((block) => isLiveOn(block, date))
    .flatMap((block) => {
      const segments = segmentsOf(block.span)
      const spillsOver = segments.length > 1

      return block.weekdays.flatMap<BlockOccurrence>((day) => {
        const found: BlockOccurrence[] = []

        if (day === today && segments[0]) {
          found.push({
            block,
            segment: segments[0],
            continuesFromPreviousDay: false,
            continuesIntoNextDay: spillsOver,
          })
        }

        if (spillsOver && day === yesterday && segments[1]) {
          found.push({
            block,
            segment: segments[1],
            continuesFromPreviousDay: true,
            continuesIntoNextDay: false,
          })
        }

        return found
      })
    })

  return occurrences.sort((left, right) => left.segment.from - right.segment.from)
}

/** Minutes of the date already claimed by block time, for the day occupancy statistics. */
export function occupiedMinutesOn(blocks: readonly BlockTime[], date: CalendarDate): number {
  return blocksOnDate(blocks, date).reduce(
    (total, occurrence) => total + (occurrence.segment.to - occurrence.segment.from),
    0,
  )
}

function isLiveOn(block: BlockTime, date: CalendarDate): boolean {
  if (isBefore(date, block.createdOn)) return false

  return !block.archivedOn || !isAfter(date, block.archivedOn)
}

function nextWeekday(day: Weekday): Weekday {
  return ((day % 7) + 1) as Weekday
}
