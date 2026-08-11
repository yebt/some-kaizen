import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { interval, timeOfDay } from '@shared/domain/time-of-day'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { createBlockTime } from '@modules/block-time/domain/block-time'
import { planInstance, scheduleAt } from '@modules/planning/domain/planned-instance'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import DayPage from './[date].vue'

const CREATED_ON = calendarDate('2020-01-01')
// A Monday, so the weekday of the block time is predictable.
const DAY = calendarDate('2026-03-09')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`day-spec-${databaseCounter}`)
})

async function renderDay(date: string = DAY) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/day/:date', component: DayPage }],
  })

  await router.push(`/day/${date}`)
  await router.isReady()

  const wrapper = mount(DayPage, {
    global: {
      plugins: [createPinia(), PiniaColada, router],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

function meditate() {
  return createCompletedHabit({
    id: newIdentifier(),
    name: 'Meditate',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

describe('the timeline', () => {
  it('renders a drop zone for the ruler and one for the tray', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const zones = (await renderDay())
      .findAll('[data-drop-zone]')
      .map((node) => node.attributes('data-drop-zone'))

    expect(zones).toContain('timeline')
    expect(zones).toContain('tray')
  })

  it('places a scheduled occurrence at its own minute', async () => {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
        durationMinutes: 20,
      }),
      timeOfDay(7 * 60),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const card = (await renderDay()).find('[data-drop-zone="timeline"] .absolute.inset-x-1')

    // 07:00 is 420 minutes into the day, and one minute is one pixel.
    expect(card.attributes('style')).toContain('top: 420px')
  })

  it('shows the time span on a scheduled card', async () => {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
        durationMinutes: 20,
      }),
      timeOfDay(7 * 60),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    expect((await renderDay()).text()).toContain('07:00 – 07:20')
  })

  it('draws block time as a band the day is built around', async () => {
    const block = createBlockTime({
      id: newIdentifier(),
      name: 'Work',
      span: interval(timeOfDay(9 * 60), 8 * 60),
      weekdays: [1, 2, 3, 4, 5],
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [block] })

    expect((await renderDay()).text()).toContain('Work')
  })

  it('shows the morning tail of a block that started the night before', async () => {
    const sleep = createBlockTime({
      id: newIdentifier(),
      name: 'Sleep',
      span: interval(timeOfDay(23 * 60), 8 * 60),
      weekdays: [7],
      createdOn: CREATED_ON,
    })

    // Sunday night runs into Monday morning, so Monday must draw it.
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [sleep] })

    expect((await renderDay()).text()).toContain('Sleep')
  })
})

describe('the tray', () => {
  it('holds an occurrence that has no time yet', async () => {
    const habit = meditate()
    const instance = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: DAY,
      period: 'daily',
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const tray = (await renderDay()).find('[data-drop-zone="tray"]')

    expect(tray.text()).toContain('Meditate')
  })

  it('is empty once everything has a time', async () => {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      timeOfDay(420),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    expect((await renderDay()).find('[data-drop-zone="tray"]').text()).toContain(
      'Everything has a time',
    )
  })

  it('ignores occurrences belonging to another day', async () => {
    const habit = meditate()
    const instance = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: calendarDate('2026-03-10'),
      period: 'daily',
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    expect((await renderDay()).find('[data-drop-zone="tray"]').text()).toContain(
      'Everything has a time',
    )
  })
})

describe('a bad date in the url', () => {
  it('falls back to today rather than crashing the screen', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderDay('not-a-date')

    expect(wrapper.find('h1').text()).toBe('Day')
  })
})
