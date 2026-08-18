import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import {
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  type NegativeOutcome,
} from '@modules/habits/domain/habit'
import {
  type HabitEntry,
  recordCompleted,
  recordNegative,
} from '@modules/habits/domain/habit-entry'

import {
  dailyMarks,
  negativeStatistics,
  periodOutcomes,
  positiveStatistics,
} from './habit-statistics'

const CREATED_ON = calendarDate('2026-03-02') // a Monday

function runningTwiceAWeek() {
  return createCompletedHabit({
    id: newIdentifier(),
    name: 'Run',
    frequency: frequency('weekly', 2),
    createdOn: CREATED_ON,
  })
}

function daily() {
  return createCompletedHabit({
    id: newIdentifier(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function done(habit: ReturnType<typeof daily>, ...days: string[]): HabitEntry[] {
  return days.map((day) => recordCompleted(newIdentifier(), habit, calendarDate(day), true))
}

function missed(habit: ReturnType<typeof daily>, ...days: string[]): HabitEntry[] {
  return days.map((day) => recordCompleted(newIdentifier(), habit, calendarDate(day), false))
}

describe('periodOutcomes', () => {
  it('groups a weekly habit by week rather than by day', () => {
    const habit = runningTwiceAWeek()
    const entries = done(habit, '2026-03-02', '2026-03-05', '2026-03-09')

    const outcomes = periodOutcomes(
      habit,
      entries,
      calendarDate('2026-03-02'),
      calendarDate('2026-03-15'),
      calendarDate('2026-03-16'),
    )

    expect(outcomes.map((entry) => entry.key)).toEqual(['2026-W10', '2026-W11'])
  })

  it('meets the period once the required repetitions are done', () => {
    const habit = runningTwiceAWeek()
    const entries = done(habit, '2026-03-02', '2026-03-05')

    const [week] = periodOutcomes(
      habit,
      entries,
      calendarDate('2026-03-02'),
      calendarDate('2026-03-08'),
      calendarDate('2026-03-09'),
    )

    expect(week).toMatchObject({ required: 2, done: 2, met: true })
  })

  it('does not meet the period one repetition short', () => {
    const habit = runningTwiceAWeek()
    const entries = done(habit, '2026-03-02')

    const [week] = periodOutcomes(
      habit,
      entries,
      calendarDate('2026-03-02'),
      calendarDate('2026-03-08'),
      calendarDate('2026-03-09'),
    )

    expect(week?.met).toBe(false)
  })

  it('includes a period with no entries at all, because an empty week is a missed week', () => {
    const habit = runningTwiceAWeek()

    const outcomes = periodOutcomes(
      habit,
      [],
      calendarDate('2026-03-02'),
      calendarDate('2026-03-15'),
      calendarDate('2026-03-16'),
    )

    expect(outcomes).toHaveLength(2)
    expect(outcomes.every((entry) => !entry.met)).toBe(true)
  })

  it('marks the period containing today as still in progress', () => {
    const habit = runningTwiceAWeek()

    const outcomes = periodOutcomes(
      habit,
      [],
      calendarDate('2026-03-02'),
      calendarDate('2026-03-08'),
      calendarDate('2026-03-04'),
    )

    expect(outcomes[0]?.inProgress).toBe(true)
  })

  it('counts partial days separately from done days', () => {
    const habit = daily()
    const entries = [...done(habit, '2026-03-02'), ...missed(habit, '2026-03-03')]

    const outcomes = periodOutcomes(
      habit,
      entries,
      calendarDate('2026-03-02'),
      calendarDate('2026-03-03'),
      calendarDate('2026-03-10'),
    )

    expect(outcomes.map((entry) => entry.done)).toEqual([1, 0])
    expect(outcomes.map((entry) => entry.missed)).toEqual([0, 1])
  })

  it('ignores days before the habit existed', () => {
    const habit = daily()

    const outcomes = periodOutcomes(
      habit,
      [],
      calendarDate('2026-02-25'),
      calendarDate('2026-03-03'),
      calendarDate('2026-03-10'),
    )

    expect(outcomes.map((entry) => entry.key)).toEqual(['2026-03-02', '2026-03-03'])
  })

  it('ignores days after the habit was archived', () => {
    const habit = { ...daily(), archivedOn: calendarDate('2026-03-03') }

    const outcomes = periodOutcomes(
      habit,
      [],
      calendarDate('2026-03-02'),
      calendarDate('2026-03-06'),
      calendarDate('2026-03-10'),
    )

    expect(outcomes.map((entry) => entry.key)).toEqual(['2026-03-02', '2026-03-03'])
  })

  it('does not count another habit’s entries', () => {
    const habit = daily()
    const other = daily()

    const outcomes = periodOutcomes(
      habit,
      done(other, '2026-03-02'),
      calendarDate('2026-03-02'),
      calendarDate('2026-03-02'),
      calendarDate('2026-03-10'),
    )

    expect(outcomes[0]?.done).toBe(0)
  })
})

describe('positiveStatistics', () => {
  const from = calendarDate('2026-03-02')

  it('counts a streak of consecutive met periods', () => {
    const habit = daily()
    const entries = done(habit, '2026-03-02', '2026-03-03', '2026-03-04')

    const stats = positiveStatistics(
      habit,
      entries,
      from,
      calendarDate('2026-03-04'),
      calendarDate('2026-03-05'),
    )

    expect(stats.currentStreak).toBe(3)
  })

  it('breaks the streak on a missed period', () => {
    const habit = daily()
    const entries = [...done(habit, '2026-03-02'), ...done(habit, '2026-03-04')]

    const stats = positiveStatistics(
      habit,
      entries,
      from,
      calendarDate('2026-03-04'),
      calendarDate('2026-03-05'),
    )

    expect(stats.currentStreak).toBe(1)
  })

  it('does not let an unfinished period break the streak', () => {
    // Two of two runs are still possible this week, so the streak stands until the week ends.
    const habit = runningTwiceAWeek()
    const entries = done(habit, '2026-03-02', '2026-03-05')

    const stats = positiveStatistics(
      habit,
      entries,
      from,
      calendarDate('2026-03-11'),
      calendarDate('2026-03-11'),
    )

    expect(stats.currentStreak).toBe(1)
  })

  it('counts the in progress period once it is already met', () => {
    const habit = runningTwiceAWeek()
    const entries = done(habit, '2026-03-02', '2026-03-05', '2026-03-09', '2026-03-10')

    const stats = positiveStatistics(
      habit,
      entries,
      from,
      calendarDate('2026-03-11'),
      calendarDate('2026-03-11'),
    )

    expect(stats.currentStreak).toBe(2)
  })

  it('reports the longest streak in history, not just the current one', () => {
    const habit = daily()
    const entries = done(habit, '2026-03-02', '2026-03-03', '2026-03-04', '2026-03-06')

    const stats = positiveStatistics(
      habit,
      entries,
      from,
      calendarDate('2026-03-06'),
      calendarDate('2026-03-07'),
    )

    expect(stats.longestStreak).toBe(3)
    expect(stats.currentStreak).toBe(1)
  })

  it('measures the completion rate over closed periods only', () => {
    const habit = daily()
    const entries = done(habit, '2026-03-02', '2026-03-03')

    const stats = positiveStatistics(
      habit,
      entries,
      from,
      calendarDate('2026-03-04'),
      calendarDate('2026-03-04'),
    )

    // Two of the three days are met, and the third is today, which is still open.
    expect(stats.completionRate).toBe(1)
  })

  it('reports a zero rate rather than dividing by nothing when no period has closed', () => {
    const habit = daily()

    const stats = positiveStatistics(habit, [], from, from, from)

    expect(stats.completionRate).toBe(0)
  })

  it('totals the days done across the range', () => {
    const habit = daily()
    const entries = done(habit, '2026-03-02', '2026-03-03')

    const stats = positiveStatistics(
      habit,
      entries,
      from,
      calendarDate('2026-03-04'),
      calendarDate('2026-03-10'),
    )

    expect(stats.totalDone).toBe(2)
  })
})

describe('negativeStatistics', () => {
  function judge(
    habit: { id: Identifier; createdOn: ReturnType<typeof calendarDate> },
    day: string,
    outcome: NegativeOutcome,
  ) {
    return recordNegative(
      newIdentifier(),
      habit as never,
      calendarDate(day),
      outcome,
      calendarDate('2026-04-01'),
    )
  }

  it('counts clean days and relapses', () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    const entries = [
      judge(habit, '2026-03-02', 'avoided'),
      judge(habit, '2026-03-03', 'relapsed'),
      judge(habit, '2026-03-04', 'avoided'),
    ]

    const stats = negativeStatistics(habit, entries, calendarDate('2026-03-05'))

    expect(stats.cleanDays).toBe(2)
    expect(stats.relapses).toBe(1)
  })

  it('reports the day of the most recent relapse', () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    const entries = [
      judge(habit, '2026-03-02', 'relapsed'),
      judge(habit, '2026-03-03', 'relapsed'),
      judge(habit, '2026-03-04', 'avoided'),
    ]

    const stats = negativeStatistics(habit, entries, calendarDate('2026-03-05'))

    expect(stats.lastRelapse).toBe('2026-03-03')
  })

  it('counts the current clean streak back from the last finished day', () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    const entries = [
      judge(habit, '2026-03-02', 'relapsed'),
      judge(habit, '2026-03-03', 'avoided'),
      judge(habit, '2026-03-04', 'avoided'),
    ]

    const stats = negativeStatistics(habit, entries, calendarDate('2026-03-05'))

    expect(stats.currentCleanStreak).toBe(2)
  })

  it('stops the current streak at an unjudged day rather than assuming it was clean', () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    // 2026-03-03 was never answered, so the streak cannot honestly run through it.
    const entries = [judge(habit, '2026-03-02', 'avoided'), judge(habit, '2026-03-04', 'avoided')]

    const stats = negativeStatistics(habit, entries, calendarDate('2026-03-05'))

    expect(stats.currentCleanStreak).toBe(1)
  })

  it('reports the longest clean streak in history', () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    const entries = [
      judge(habit, '2026-03-02', 'avoided'),
      judge(habit, '2026-03-03', 'avoided'),
      judge(habit, '2026-03-04', 'avoided'),
      judge(habit, '2026-03-05', 'relapsed'),
      judge(habit, '2026-03-06', 'avoided'),
    ]

    const stats = negativeStatistics(habit, entries, calendarDate('2026-03-07'))

    expect(stats.longestCleanStreak).toBe(3)
    expect(stats.currentCleanStreak).toBe(1)
  })

  it('never judges today, so a fresh habit has nothing to report', () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })

    const stats = negativeStatistics(habit, [], CREATED_ON)

    expect(stats).toMatchObject({ judgedDays: 0, cleanDays: 0, relapses: 0, cleanRate: 0 })
  })

  it('rates cleanliness over judged days only, ignoring days never answered', () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    const entries = [judge(habit, '2026-03-02', 'avoided'), judge(habit, '2026-03-03', 'relapsed')]

    const stats = negativeStatistics(habit, entries, calendarDate('2026-03-06'))

    expect(stats.judgedDays).toBe(2)
    expect(stats.cleanRate).toBe(0.5)
  })
})

describe('dailyMarks', () => {
  const from = calendarDate('2026-03-02')
  const to = calendarDate('2026-03-06')

  it('marks every active day, so a calendar has a cell for each', () => {
    const habit = daily()

    expect([...dailyMarks(habit, [], from, to).keys()]).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
      '2026-03-06',
    ])
  })

  it('separates a day never answered from a day answered badly', () => {
    // Painting them alike turns "I forgot to open the app" into a wall of failure.
    const habit = daily()
    const marks = dailyMarks(habit, missed(habit, '2026-03-02'), from, to)

    expect(marks.get(calendarDate('2026-03-02'))).toBe('missed')
    expect(marks.get(calendarDate('2026-03-03'))).toBe('none')
  })

  it('records a completed day', () => {
    const habit = daily()
    const marks = dailyMarks(habit, done(habit, '2026-03-04'), from, to)

    expect(marks.get(calendarDate('2026-03-04'))).toBe('done')
  })

  it('summarises a day by its best outcome', () => {
    // Three gym slots where one was completed is a day with something in it, not two
    // failures.
    const habit = daily()
    const entries = [
      ...missed(habit, '2026-03-04'),
      ...done(habit, '2026-03-04'),
      ...missed(habit, '2026-03-04'),
    ].map((entry, index) => ({ ...entry, instanceId: newIdentifier(), recordedAt: index }))

    expect(dailyMarks(habit, entries, from, to).get(calendarDate('2026-03-04'))).toBe('done')
  })

  it('leaves out days before the habit existed', () => {
    const habit = daily()

    expect(
      dailyMarks(habit, [], calendarDate('2026-02-25'), to).has(calendarDate('2026-02-25')),
    ).toBe(false)
  })

  it('leaves out days after it was archived', () => {
    const habit = { ...daily(), archivedOn: calendarDate('2026-03-03') }

    expect(dailyMarks(habit, [], from, to).has(calendarDate('2026-03-05'))).toBe(false)
  })

  it('marks a negative habit with its verdict', () => {
    const habit = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })
    const entries = [
      recordNegative(
        newIdentifier(),
        habit,
        calendarDate('2026-03-03'),
        'relapsed',
        calendarDate('2026-03-04'),
      ),
    ]

    expect(dailyMarks(habit, entries, from, to).get(calendarDate('2026-03-03'))).toBe('relapsed')
  })

  it('ignores another habit’s entries', () => {
    const habit = daily()
    const other = daily()

    expect(
      dailyMarks(habit, done(other, '2026-03-04'), from, to).get(calendarDate('2026-03-04')),
    ).toBe('none')
  })
})
