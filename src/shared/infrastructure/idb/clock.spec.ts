import { describe, expect, it } from 'vitest'

import { monotonicClock } from './clock'

/** A wall clock a test can push around, the way a timezone change pushes a real one. */
function wallClock(...readings: number[]) {
  let index = 0

  return () => readings[Math.min(index++, readings.length - 1)] ?? 0
}

describe('a clock that cannot go backwards', () => {
  it('hands out the wall clock while it is moving forward', () => {
    const clock = monotonicClock(wallClock(1000, 2000, 3000))

    expect([clock(), clock(), clock()]).toEqual([1000, 2000, 3000])
  })

  it('keeps rising when the wall clock jumps backwards', () => {
    // A timezone change, an NTP correction, or someone setting the date wrong and back.
    const clock = monotonicClock(wallClock(5000, 1000))

    expect(clock()).toBe(5000)
    expect(clock()).toBe(5001)
  })

  it('separates two writes inside the same millisecond', () => {
    // Equal counts as backwards. A correction saved immediately after the thing it corrects
    // would otherwise be a coin toss over which one currently stands.
    const clock = monotonicClock(wallClock(1000, 1000, 1000))

    expect([clock(), clock(), clock()]).toEqual([1000, 1001, 1002])
  })

  it('catches up to the wall clock once it has moved past', () => {
    // The drift is a floor, not an offset: it should not accumulate forever.
    const clock = monotonicClock(wallClock(5000, 1000, 9000))

    clock()
    clock()

    expect(clock()).toBe(9000)
  })

  it('starts above whatever is already stored', () => {
    // Without the seed, a restart resets the counter and the clock is once again behind the
    // records it exists to stay ahead of — which is precisely the case it was built for.
    const clock = monotonicClock(wallClock(1000), 8000)

    expect(clock()).toBe(8001)
  })

  it('reports the last value it handed out', () => {
    const clock = monotonicClock(wallClock(4000))

    clock()

    expect(clock.last()).toBe(4000)
  })
})
