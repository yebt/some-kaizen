import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { PLATFORM_KEY, type PlatformServices } from '@core/platform-context'
import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { interval, timeOfDay } from '@shared/domain/time-of-day'
import {
  createCompletedHabit,
  createMeasuredHabit,
  frequency,
  measure,
} from '@modules/habits/domain/habit'
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

/**
 * A platform that can do nothing, which is what a browser tab genuinely is.
 *
 * Recording what it was asked lets a test prove the screen asks for permission at the
 * moment a reminder is set rather than on launch.
 */
function stubPlatform(): PlatformServices & { asked: { permission: number } } {
  const asked = { permission: 0 }

  return {
    asked,
    files: { save: async () => undefined, pick: async () => null },
    reminders: {
      ensurePermission: async () => {
        asked.permission += 1

        return 'unsupported'
      },
      sync: async () => undefined,
    },
  }
}

let platform: ReturnType<typeof stubPlatform>

async function renderDay(date: string = DAY) {
  platform = stubPlatform()

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/day/:date', component: DayPage }],
  })

  await router.push(`/day/${date}`)
  await router.isReady()

  const wrapper = mount(DayPage, {
    global: {
      plugins: [createPinia(), PiniaColada, router],
      provide: {
        [PERSISTENCE_KEY as symbol]: persistence,
        [PLATFORM_KEY as symbol]: platform,
      },
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
    // Weekly rather than daily, because a daily habit is due today on its own and would
    // rightly appear in the tray whatever its other days look like.
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Run',
      frequency: frequency('weekly', 2),
      createdOn: CREATED_ON,
    })
    const instance = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: calendarDate('2026-03-10'),
      period: 'weekly',
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    expect((await renderDay()).find('[data-drop-zone="tray"]').text()).toContain(
      'Everything has a time',
    )
  })

  it('offers a daily habit that was never placed, so it can be given an hour', async () => {
    // The tray used to read stored occurrences only, which meant the one thing the timeline
    // exists for was impossible until the habit had already been done.
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect((await renderDay()).find('[data-drop-zone="tray"]').text()).toContain('Meditate')
  })

  it('offers a measured habit that was never placed', async () => {
    const water = createMeasuredHabit({
      id: newIdentifier(),
      name: 'Drink water',
      frequency: frequency('daily', 1),
      measure: measure('litres', 1, 2),
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [water] })

    expect((await renderDay()).find('[data-drop-zone="tray"]').text()).toContain('Drink water')
  })
})

describe('a bad date in the url', () => {
  it('falls back to today rather than crashing the screen', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderDay('not-a-date')

    expect(wrapper.find('h1').text()).toBe('Day')
  })
})

describe('adjusting an occurrence', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  function scheduledMeditation() {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      timeOfDay(7 * 60),
    )

    return { habit, instance }
  }

  async function openSheet() {
    const { habit, instance } = scheduledMeditation()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const wrapper = await renderDay()

    await wrapper.find('[aria-label="Adjust Meditate"]').trigger('click')
    await flushPromises()

    return wrapper
  }

  async function press(wrapper: Awaited<ReturnType<typeof renderDay>>, label: string) {
    await wrapper
      .findAll('dialog button')
      .find((node) => node.text() === label)
      ?.trigger('click')
    await settle()
  }

  it('offers both the length and the reminder, which are the two things about it', async () => {
    const text = (await openSheet()).find('dialog').text()

    expect(text).toContain('How long')
    expect(text).toContain('Remind me')
  })

  it('changes how long the occurrence lasts', async () => {
    const wrapper = await openSheet()

    await press(wrapper, '90 min')

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(90)
  })

  it('keeps the time it was given while changing the length', async () => {
    const wrapper = await openSheet()

    await press(wrapper, '45 min')

    expect((await persistence.instances.all())[0]?.startsAt).toBe(7 * 60)
  })

  it('stores a chosen reminder', async () => {
    const wrapper = await openSheet()

    await press(wrapper, '15 before')

    expect((await persistence.instances.all())[0]?.reminderMinutesBefore).toBe(15)
  })

  it('removes a reminder again', async () => {
    const wrapper = await openSheet()

    await press(wrapper, '15 before')
    await press(wrapper, 'None')

    expect((await persistence.instances.all())[0]?.reminderMinutesBefore).toBeUndefined()
  })

  it('leads to the block itself rather than editing its hours here', async () => {
    // A block's length is its hours, and those belong to the block rather than to one day.
    const block = createBlockTime({
      id: newIdentifier(),
      name: 'Work',
      span: interval(timeOfDay(9 * 60), 8 * 60),
      weekdays: [1, 2, 3, 4, 5],
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [block] })

    const wrapper = await renderDay()

    expect(wrapper.find(`a[href="/block-time/${block.id}"]`).exists()).toBe(true)
  })
})
