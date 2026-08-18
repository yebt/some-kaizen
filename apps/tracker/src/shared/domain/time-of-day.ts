/**
 * A wall clock time expressed as minutes elapsed since local midnight, from 0 to 1439.
 *
 * The day view is a vertical ruler of minutes, so treating time as a single integer makes
 * positioning, snapping and dragging plain arithmetic instead of date juggling.
 */
export type TimeOfDay = number & { readonly __brand: unique symbol }

/**
 * A span on the day ruler, anchored at a start time and measured forward in minutes.
 *
 * A span may run past midnight — sleeping from 23:00 for eight hours is the obvious case —
 * which is exactly why the end is stored as a duration rather than as a second wall clock
 * time. `23:00 -> 07:00` written as two clock times looks like a backwards, empty range;
 * written as `start 1380, duration 480` it stays unambiguous.
 */
export interface TimeInterval {
  readonly start: TimeOfDay
  readonly durationMinutes: number
}

/** A span already flattened onto a single day, so `from` is always earlier than `to`. */
export interface TimeSegment {
  readonly from: number
  readonly to: number
}

export const MINUTES_PER_DAY = 1440

const CLOCK_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/

export class InvalidTimeOfDayError extends Error {
  constructor(readonly value: unknown) {
    super(`"${String(value)}" is not a valid time of day, expected 0 to 1439 minutes.`)
    this.name = 'InvalidTimeOfDayError'
  }
}

export class InvalidTimeIntervalError extends Error {
  constructor(readonly durationMinutes: number) {
    super(
      `A time interval must last between 1 and ${MINUTES_PER_DAY} minutes, received ${durationMinutes}.`,
    )
    this.name = 'InvalidTimeIntervalError'
  }
}

export function timeOfDay(minutes: number): TimeOfDay {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= MINUTES_PER_DAY) {
    throw new InvalidTimeOfDayError(minutes)
  }

  return minutes as TimeOfDay
}

/** Parses a 24 hour `HH:mm` string, the shape used by `<input type="time">`. */
export function parseTime(value: string): TimeOfDay {
  const match = CLOCK_PATTERN.exec(value)

  if (!match) throw new InvalidTimeOfDayError(value)

  return timeOfDay(Number(match[1]) * 60 + Number(match[2]))
}

/**
 * Renders minutes as a clock string. Values past the end of the day are folded back onto
 * the clock, so the end of a night shift reads as `08:00` rather than as `32:00`.
 */
export function formatTime(minutes: number, options: { hour12?: boolean } = {}): string {
  // Without this guard a corrupted value renders as the literal string "NaN:NaN" in the
  // timeline, which hides the corruption behind something that looks like a label.
  if (!Number.isFinite(minutes)) throw new InvalidTimeOfDayError(minutes)

  const normalised = ((Math.round(minutes) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY
  const hours = Math.floor(normalised / 60)
  const remainder = normalised % 60
  const paddedMinutes = String(remainder).padStart(2, '0')

  if (!options.hour12) return `${String(hours).padStart(2, '0')}:${paddedMinutes}`

  const suffix = hours < 12 ? 'AM' : 'PM'
  const displayHours = hours % 12 === 0 ? 12 : hours % 12

  return `${displayHours}:${paddedMinutes} ${suffix}`
}

/** Moves along the clock, wrapping around midnight in either direction. */
export function addMinutes(time: TimeOfDay, amount: number): TimeOfDay {
  const shifted = (((time + amount) % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY

  return shifted as TimeOfDay
}

/**
 * Rounds to the nearest multiple of `step`, which is how a dragged card lands on a clean
 * time instead of on 09:23. A snap that would overshoot the day is pulled back to 23:59.
 */
export function snapToStep(minutes: number, step: number): TimeOfDay {
  const snapped = Math.round(minutes / step) * step

  return timeOfDay(Math.min(Math.max(snapped, 0), MINUTES_PER_DAY - 1))
}

/**
 * Validates a span length on its own, for callers that hold a duration before they hold a
 * start time. A planned occurrence has a length from the moment it is created, but only
 * gains a start once it is dropped onto the timeline.
 */
export function assertDuration(durationMinutes: number): number {
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes <= 0 ||
    durationMinutes > MINUTES_PER_DAY
  ) {
    throw new InvalidTimeIntervalError(durationMinutes)
  }

  return durationMinutes
}

export function interval(start: TimeOfDay, durationMinutes: number): TimeInterval {
  return { start, durationMinutes: assertDuration(durationMinutes) }
}

/**
 * Builds a span from the two clock times a person actually types.
 *
 * An end at or before the start is read as the following morning, because that is what
 * someone means by "23:00 to 07:00". Refusing it as a backwards range would make the most
 * common block of all, sleep, impossible to enter. Equal times mean a full day rather than
 * an empty one, since a zero length block would occupy nothing.
 */
export function spanBetween(start: TimeOfDay, end: TimeOfDay): TimeInterval {
  const elapsed = end - start

  return interval(start, elapsed > 0 ? elapsed : elapsed + MINUTES_PER_DAY)
}

/** The wall clock time the interval ends at, folded back onto the clock when it runs past midnight. */
export function endOf(span: TimeInterval): TimeOfDay {
  return ((span.start + span.durationMinutes) % MINUTES_PER_DAY) as TimeOfDay
}

export function wrapsMidnight(span: TimeInterval): boolean {
  return span.start + span.durationMinutes > MINUTES_PER_DAY
}

/**
 * Flattens an interval onto the day as one or two forward running segments.
 *
 * Splitting the night shift into `[23:00, 24:00)` and `[00:00, 07:00)` is what lets the
 * overlap check stay a simple comparison instead of a pile of special cases.
 */
export function segmentsOf(span: TimeInterval): TimeSegment[] {
  const rawEnd = span.start + span.durationMinutes

  if (rawEnd <= MINUTES_PER_DAY) return [{ from: span.start, to: rawEnd }]

  return [
    { from: span.start, to: MINUTES_PER_DAY },
    { from: 0, to: rawEnd - MINUTES_PER_DAY },
  ]
}

/**
 * Whether two spans collide on the clock. Touching ends do not collide, so a block ending
 * at 10:00 and one starting at 10:00 form a legal back to back schedule.
 */
export function intervalsOverlap(span: TimeInterval, other: TimeInterval): boolean {
  const otherSegments = segmentsOf(other)

  return segmentsOf(span).some((segment) =>
    otherSegments.some(
      (otherSegment) => segment.from < otherSegment.to && otherSegment.from < segment.to,
    ),
  )
}
