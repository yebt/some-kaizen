/**
 * A clock that never goes backwards on this device.
 *
 * Every stored record is stamped with a time, and the whole point of that stamp is to answer
 * "which of these two versions is newer". A wall clock cannot answer it reliably: it steps
 * backwards on a timezone change, an NTP correction, a daylight saving jump, or a user who
 * simply sets the date wrong and sets it back. When that happens, an edit made after another
 * edit gets the smaller number, and every rule downstream — the entry that currently stands,
 * a future merge between two devices — silently picks the older one.
 *
 * The fix is to keep issuing the wall clock's answer while it is moving forward, and to add
 * one millisecond when it is not. The result is still roughly the real time; it just refuses
 * to be a smaller number than one already handed out.
 *
 * Seeding matters as much as the counter. A clock that starts at zero on every launch would
 * be reset by exactly the event it exists to survive: set the date back an hour, restart the
 * app, and the wall clock is once again behind the records already on disk. So the seed is
 * the highest timestamp the database already holds.
 */
export interface MonotonicClock {
  (): number
  /** The last value handed out. Exposed so a caller can persist or inspect it. */
  readonly last: () => number
}

export function monotonicClock(source: () => number = Date.now, seed = 0): MonotonicClock {
  let last = seed

  const clock = () => {
    const wall = source()

    // Equal counts as backwards: two writes inside the same millisecond must still be
    // ordered, or a correction saved immediately after the thing it corrects is a coin toss.
    last = wall > last ? wall : last + 1

    return last
  }

  return Object.assign(clock, { last: () => last })
}
