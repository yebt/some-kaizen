import { addDays, type CalendarDate, todayIn, type Weekday } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { interval, timeOfDay } from '@shared/domain/time-of-day'
import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  type Habit,
  measure,
} from '@modules/habits/domain/habit'
import {
  type HabitEntry,
  recordCompleted,
  recordMeasured,
  recordNegative,
} from '@modules/habits/domain/habit-entry'
import { type BlockTime, createBlockTime } from '@modules/block-time/domain/block-time'
import { createRoutine, type Routine } from '@modules/habits/domain/routine'
import {
  planInstance,
  type PlannedInstance,
  scheduleAt,
} from '@modules/planning/domain/planned-instance'

/**
 * A worked example dataset used to develop the screens before persistence exists.
 *
 * This is scaffolding, not seed data: it is replaced wholesale once the IndexedDB adapter
 * lands, and nothing outside the dev preview should import it.
 */
export interface PreviewDataset {
  readonly today: CalendarDate
  readonly habits: Habit[]
  readonly entries: HabitEntry[]
  readonly instances: PlannedInstance[]
  readonly blocks: BlockTime[]
  readonly routines: Routine[]
}

const EVERY_DAY: Weekday[] = [1, 2, 3, 4, 5, 6, 7]
const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5]

export function buildPreviewDataset(now: Date = new Date()): PreviewDataset {
  const today = todayIn(now)
  const createdOn = addDays(today, -45)

  const water = createMeasuredHabit({
    id: newIdentifier(),
    name: 'Drink water',
    frequency: frequency('daily', 1),
    measure: measure('litres', 1, 2),
    createdOn,
  })

  const meditate = createCompletedHabit({
    id: newIdentifier(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn,
  })

  const run = createCompletedHabit({
    id: newIdentifier(),
    name: 'Run',
    frequency: frequency('weekly', 2),
    createdOn,
  })

  const smoking = createNegativeHabit({ id: newIdentifier(), name: 'Smoking', createdOn })

  const habits: Habit[] = [water, meditate, run, smoking]

  /*
   * Two named parts of a day, so the demo shows the shape rather than a flat list.
   *
   * `Run` is left out of both on purpose. A day is never entirely arranged, and the demo
   * would be lying about the feature if every habit happened to have a home.
   */
  const routines: Routine[] = [
    createRoutine({
      id: newIdentifier(),
      name: 'Morning',
      habitIds: [meditate.id, water.id],
      createdOn,
    }),
    createRoutine({ id: newIdentifier(), name: 'Wind down', habitIds: [], createdOn }),
  ]

  const entries: HabitEntry[] = [
    recordMeasured(newIdentifier(), water, today, 1.2),
    recordCompleted(newIdentifier(), meditate, addDays(today, -1), true),
    recordCompleted(newIdentifier(), meditate, addDays(today, -2), true),
    recordCompleted(newIdentifier(), run, addDays(today, -2), true),
    recordNegative(newIdentifier(), smoking, addDays(today, -2), 'avoided', addDays(today, -1)),
  ]

  const instances: PlannedInstance[] = [
    scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: meditate.id,
        date: today,
        period: 'daily',
        durationMinutes: 20,
      }),
      timeOfDay(7 * 60),
    ),
    scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: run.id,
        date: today,
        period: 'weekly',
        durationMinutes: 45,
      }),
      timeOfDay(18 * 60 + 30),
    ),
    planInstance({ id: newIdentifier(), habitId: water.id, date: today, period: 'daily' }),
  ]

  const blocks: BlockTime[] = [
    createBlockTime({
      id: newIdentifier(),
      name: 'Sleep',
      span: interval(timeOfDay(23 * 60), 8 * 60),
      weekdays: EVERY_DAY,
      createdOn,
    }),
    createBlockTime({
      id: newIdentifier(),
      name: 'Work',
      span: interval(timeOfDay(9 * 60), 8 * 60),
      weekdays: WEEKDAYS,
      createdOn,
    }),
  ]

  return { today, habits, entries, instances, blocks, routines }
}
