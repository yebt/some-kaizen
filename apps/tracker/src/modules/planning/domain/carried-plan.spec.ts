import { describe, expect, it } from 'vitest'

import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'
import {
  archiveHabit,
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  onWeekdays,
  type PositiveHabit,
} from '@modules/habits/domain/habit'

import { appliesOn, carryPlan, sourceDayFor } from './carried-plan'
import { impliedOccurrenceId } from './day-agenda'
import { planInstance, remindBefore, scheduleAt } from './planned-instance'

const CREATED_ON = calendarDate('2020-01-01')

/** 2026-03-10 is a Tuesday, so the Tuesday before it is 2026-03-03. */
const TUESDAY = calendarDate('2026-03-10')
const LAST_TUESDAY = calendarDate('2026-03-03')
const MONDAY = calendarDate('2026-03-09')

function habitNamed(name: string): PositiveHabit {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function placed(habit: { id: string }, date: string, at?: number) {
  const base = planInstance({
    id: newIdentifier(),
    habitId: habit.id as never,
    date: calendarDate(date),
    period: 'daily',
    durationMinutes: 45,
  })

  return at === undefined ? base : scheduleAt(base, timeOfDay(at))
}

describe('choosing the day to bring a plan from', () => {
  it('prefers the same weekday last week, which is the unit a life repeats on', () => {
    const habit = habitNamed('Run')
    const instances = [placed(habit, '2026-03-03'), placed(habit, '2026-03-09')]

    expect(sourceDayFor(TUESDAY, instances)).toBe(LAST_TUESDAY)
  })

  it('falls back to yesterday when that Tuesday has nothing on it', () => {
    // The case of someone who has not been using the app a week yet, which is exactly when
    // rebuilding a day by hand hurts most.
    const instances = [placed(habitNamed('Run'), '2026-03-09')]

    expect(sourceDayFor(TUESDAY, instances)).toBe(MONDAY)
  })

  it('offers nothing when neither day was ever arranged', () => {
    // An empty day is not a plan, and offering to bring it would be offering nothing.
    expect(sourceDayFor(TUESDAY, [placed(habitNamed('Run'), '2026-02-01')])).toBeUndefined()
  })

  it('ignores days that are neither of the two candidates', () => {
    expect(sourceDayFor(TUESDAY, [placed(habitNamed('Run'), '2026-03-08')])).toBeUndefined()
  })
})

describe('whether a habit belongs on a day', () => {
  it('accepts a habit whose days are open, which is what the planner decides', () => {
    expect(appliesOn(habitNamed('Run'), TUESDAY)).toBe(true)
  })

  it('accepts a habit that names this very day', () => {
    const gym = createCompletedHabit({
      id: newIdentifier(),
      name: 'Gym',
      frequency: onWeekdays([2]),
      createdOn: CREATED_ON,
    })

    expect(appliesOn(gym, TUESDAY)).toBe(true)
  })

  it('refuses a habit that names other days', () => {
    const gym = createCompletedHabit({
      id: newIdentifier(),
      name: 'Gym',
      frequency: onWeekdays([1]),
      createdOn: CREATED_ON,
    })

    expect(appliesOn(gym, TUESDAY)).toBe(false)
  })

  it('refuses a habit you are quitting, which is never planned', () => {
    const smoking = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })

    expect(appliesOn(smoking, TUESDAY)).toBe(false)
  })

  it('refuses a habit archived before the day', () => {
    expect(appliesOn(archiveHabit(habitNamed('Run'), calendarDate('2026-01-01')), TUESDAY)).toBe(
      false,
    )
  })
})

describe('carrying a plan onto a day', () => {
  it('brings each occurrence over at the time it had', () => {
    const run = habitNamed('Run')

    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [run],
      instances: [placed(run, '2026-03-03', 18 * 60 + 30)],
    })

    expect(plan.carried).toHaveLength(1)
    expect(plan.carried[0]).toMatchObject({
      habitId: run.id,
      date: TUESDAY,
      startsAt: 18 * 60 + 30,
      durationMinutes: 45,
    })
  })

  it('brings an occurrence that never had a time, still without one', () => {
    // "Sometime that day" has always been a valid plan, and turning it into a time here
    // would be inventing a decision.
    const run = habitNamed('Run')

    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [run],
      instances: [placed(run, '2026-03-03')],
    })

    expect(plan.carried[0]).not.toHaveProperty('startsAt')
  })

  it('gives each carried occurrence the identity the target day derives', () => {
    // Otherwise the carried card sits beside the duty the day already implied, and the day
    // claims the habit is owed twice.
    const run = habitNamed('Run')

    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [run],
      instances: [placed(run, '2026-03-03', 18 * 60)],
    })

    expect(plan.carried[0]?.id).toBe(impliedOccurrenceId(run.id, TUESDAY, 0))
  })

  it('brings a habit arranged twice over twice, on separate identities', () => {
    const water = habitNamed('Drink water')

    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [water],
      instances: [placed(water, '2026-03-03', 9 * 60), placed(water, '2026-03-03', 15 * 60)],
    })

    expect(plan.carried).toHaveLength(2)
    expect(new Set(plan.carried.map((one) => one.id)).size).toBe(2)
  })

  it('brings the reminder with the time it counts back from', () => {
    const run = habitNamed('Run')
    const withReminder = remindBefore(placed(run, '2026-03-03', 18 * 60), 15)

    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [run],
      instances: [withReminder],
    })

    expect(plan.carried[0]).toMatchObject({ reminderMinutesBefore: 15 })
  })

  it('takes nothing from any day but the one asked for', () => {
    const run = habitNamed('Run')

    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [run],
      instances: [placed(run, '2026-03-02', 9 * 60)],
    })

    expect(plan.carried).toEqual([])
  })
})

describe('what carrying refuses to bring', () => {
  it('drops a habit that names days the target is not one of, and names it', () => {
    // The case the whole feature turns on. Scheduling a Monday-only habit onto a Tuesday
    // invents a commitment nobody made, and then marks it missed.
    const gym = createCompletedHabit({
      id: newIdentifier(),
      name: 'Gym',
      frequency: onWeekdays([1]),
      createdOn: CREATED_ON,
    })

    const plan = carryPlan({
      from: MONDAY,
      to: TUESDAY,
      habits: [gym],
      instances: [placed(gym, '2026-03-09', 7 * 60)],
    })

    expect(plan.carried).toEqual([])
    expect(plan.dropped).toEqual([gym])
  })

  it('drops a habit archived before the target day', () => {
    const retired = archiveHabit(habitNamed('Run'), calendarDate('2026-03-05'))

    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [retired],
      instances: [placed(retired, '2026-03-03', 18 * 60)],
    })

    expect(plan.carried).toEqual([])
    expect(plan.dropped).toEqual([retired])
  })

  it('leaves alone a habit the target day already has, and says so', () => {
    // A decision already made about today outranks one made about a day that has been and
    // gone. An import that silently overwrites is one nobody presses twice.
    const run = habitNamed('Run')
    const today = placed(run, '2026-03-10', 7 * 60)

    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [run],
      instances: [placed(run, '2026-03-03', 18 * 60), today],
    })

    expect(plan.carried).toEqual([])
    expect(plan.kept).toEqual([run])
  })

  it('skips an occurrence whose habit no longer exists, without naming it', () => {
    const plan = carryPlan({
      from: LAST_TUESDAY,
      to: TUESDAY,
      habits: [],
      instances: [placed({ id: newIdentifier() }, '2026-03-03', 9 * 60)],
    })

    expect(plan.carried).toEqual([])
    expect(plan.dropped).toEqual([])
  })

  it('names a dropped habit once, however many times it was arranged', () => {
    const gym = createCompletedHabit({
      id: newIdentifier(),
      name: 'Gym',
      frequency: onWeekdays([1]),
      createdOn: CREATED_ON,
    })

    const plan = carryPlan({
      from: MONDAY,
      to: TUESDAY,
      habits: [gym],
      instances: [placed(gym, '2026-03-09', 7 * 60), placed(gym, '2026-03-09', 18 * 60)],
    })

    expect(plan.dropped).toEqual([gym])
  })
})
