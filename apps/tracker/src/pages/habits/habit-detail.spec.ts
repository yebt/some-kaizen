import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'
import {
  archiveHabit,
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  onWeekdays,
} from '@modules/habits/domain/habit'
import { recordCompleted } from '@modules/habits/domain/habit-entry'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import HabitDetailPage from './[id]/index.vue'

/** A fixed Wednesday at noon, so the weekday figures below do not depend on the day it runs. */
const WEDNESDAY = new Date(2026, 7, 12, 12)

const CREATED_ON = calendarDate('2026-03-02')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: WEDNESDAY, shouldAdvanceTime: true })
  databaseCounter += 1
  globalThis.localStorage?.clear()
  persistence = await createPersistence(`habit-detail-spec-${databaseCounter}`)
})

afterEach(() => {
  vi.useRealTimers()
})

async function render(habitId: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/habits', component: HabitDetailPage },
      { path: '/habits/:id', component: HabitDetailPage },
      { path: '/habits/:id/edit', component: HabitDetailPage },
    ],
  })

  await router.push(`/habits/${habitId}`)
  await router.isReady()

  const wrapper = mount(HabitDetailPage, {
    global: {
      plugins: [createPinia(), PiniaColada, router],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

function meditate(overrides: { usualTime?: number; usualDurationMinutes?: number } = {}) {
  return createCompletedHabit({
    id: newIdentifier(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
    ...(overrides.usualTime === undefined ? {} : { usualTime: timeOfDay(overrides.usualTime) }),
    ...(overrides.usualDurationMinutes === undefined
      ? {}
      : { usualDurationMinutes: overrides.usualDurationMinutes }),
  })
}

function on(habit: ReturnType<typeof meditate>, date: string, done: boolean) {
  return recordCompleted(newIdentifier(), habit, calendarDate(date), done)
}

/** A row of the summary list, by its label. */
function summaryRow(wrapper: Awaited<ReturnType<typeof render>>, label: string): string {
  const row = wrapper.findAll('dl div').find((node) => node.find('dt').text().trim() === label)

  if (!row) throw new Error(`No summary row labelled ${label}. Saw: ${wrapper.text()}`)

  return row.find('dd').text().trim()
}

describe('what the habit is', () => {
  it('states the schedule in words', async () => {
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect(summaryRow(await render(habit.id), 'Schedule')).toContain('day')
  })

  it('says when tracking began, which is what turns a rate into a judgement', async () => {
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect(summaryRow(await render(habit.id), 'Tracking since')).toContain('2026')
  })

  it('counts days answered rather than answers written', async () => {
    // Correcting the same day twice is bookkeeping, not effort.
    const habit = meditate()

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [
        recordCompleted(newIdentifier(), habit, calendarDate('2026-08-10'), true, {
          recordedAt: 1,
        }),
        recordCompleted(newIdentifier(), habit, calendarDate('2026-08-10'), false, {
          recordedAt: 2,
        }),
        on(habit, '2026-08-11', true),
      ],
    })

    expect(summaryRow(await render(habit.id), 'Days answered')).toBe('2')
  })

  it('states the usual hour when the habit has one', async () => {
    const habit = meditate({ usualTime: 7 * 60 })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect(summaryRow(await render(habit.id), 'Usual time')).toBe('07:00')
  })

  it('says nothing about an hour the habit never stated', async () => {
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect((await render(habit.id)).text()).not.toContain('Usual time')
  })

  it('states the usual length when the habit has one', async () => {
    const habit = meditate({ usualDurationMinutes: 20 })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect(summaryRow(await render(habit.id), 'Usual length')).toBe('20 min')
  })

  it('says when a habit was archived rather than hiding that it was', async () => {
    const habit = archiveHabit(meditate(), calendarDate('2026-07-01'))

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect(summaryRow(await render(habit.id), 'Archived')).toContain('2026')
  })

  it('describes a habit being quit in its own terms', async () => {
    const smoking = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [smoking] })

    expect(summaryRow(await render(smoking.id), 'Schedule')).toContain('Quitting')
  })
})

describe('how the habit goes across the week', () => {
  function bars(wrapper: Awaited<ReturnType<typeof render>>) {
    return wrapper
      .find('[aria-label="Rate by day of the week"]')
      .findAll('[role="img"]')
      .map((bar) => bar.attributes('aria-label'))
  }

  it('draws one bar per weekday, each saying what it is made of', async () => {
    const habit = meditate()

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [on(habit, '2026-08-10', true), on(habit, '2026-08-03', false)],
    })

    const drawn = bars(await render(habit.id))

    expect(drawn).toHaveLength(7)
    expect(drawn).toContain('Mon: 50% of 2 days')
  })

  it('says nothing rather than zero for a weekday never answered', async () => {
    // Zero would read as "you fail every Thursday" when the truth is "you have not said".
    const habit = meditate()

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [on(habit, '2026-08-10', true)],
    })

    expect(bars(await render(habit.id))).toContain('Thu: nothing answered')
  })

  it('names the best and worst day once the week is genuinely uneven', async () => {
    const habit = meditate()

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [
        on(habit, '2026-08-10', true),
        on(habit, '2026-08-03', true),
        on(habit, '2026-08-11', false),
        on(habit, '2026-08-04', false),
      ],
    })

    const text = (await render(habit.id)).text()

    expect(text).toContain('Best day')
    expect(text).toContain('Mon')
  })

  it('refuses to name one before there is a pattern', async () => {
    const habit = meditate()

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [on(habit, '2026-08-10', true), on(habit, '2026-08-11', false)],
    })

    const text = (await render(habit.id)).text()

    expect(text).toContain('Not enough answered days')
    expect(text).not.toContain('Best day')
  })

  it('leaves out weekdays a habit never claimed', async () => {
    // A Monday-Wednesday-Friday habit has no opinion about Sunday, and a rate there would
    // describe the schedule rather than the person.
    const gym = createCompletedHabit({
      id: newIdentifier(),
      name: 'Gym',
      frequency: onWeekdays([1, 3, 5]),
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [gym],
      entries: [recordCompleted(newIdentifier(), gym, calendarDate('2026-08-09'), false)],
    })

    expect(bars(await render(gym.id))).toContain('Sun: nothing answered')
  })
})
