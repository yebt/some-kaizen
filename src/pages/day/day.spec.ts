import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { LONG_PRESS_MS } from '@shared/ui/drag/use-drag-and-drop'
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
import { createRoutine } from '@modules/habits/domain/routine'
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
  // Preferences live in localStorage and outlive a test. A zoom level left behind by one
  // case silently rescales every pixel assertion in the next one.
  globalThis.localStorage?.clear()
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
  it('renders a drop zone for the ruler', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const zones = (await renderDay())
      .findAll('[data-drop-zone]')
      .map((node) => node.attributes('data-drop-zone'))

    expect(zones).toContain('timeline')
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
  /** The drawer is shut by default, so a test that wants its contents has to open it. */
  async function openTray(wrapper: Awaited<ReturnType<typeof renderDay>>) {
    await wrapper
      .findAll('button')
      .find((node) => node.text().includes('needs an hour') || node.text().includes('need an hour'))
      ?.trigger('click')
    await flushPromises()

    return wrapper
  }

  it('counts what still needs an hour without opening on its own', async () => {
    // The list of unplaced habits is a tool for the moment you decide to place one, not a
    // permanent feature of looking at a day.
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderDay()

    // Present but hidden, not removed: the chip inside it holds the pointer capture during
    // a drag, so the panel has to survive being got out of the way.
    expect(wrapper.find('[data-drop-zone="tray"]').isVisible()).toBe(false)
    expect(wrapper.text()).toContain('needs an hour')
  })

  it('holds an occurrence that has no time yet', async () => {
    const habit = meditate()
    const instance = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: DAY,
      period: 'daily',
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const tray = (await openTray(await renderDay())).find('[data-drop-zone="tray"]')

    expect(tray.text()).toContain('Meditate')
  })

  it('gets out of the way entirely once everything has a time', async () => {
    // A drawer with nothing in it is a drawer taking up a screen for no reason. The place to
    // drop a card back appears while one is in the air, not while the day sits still.
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      timeOfDay(420),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    expect((await renderDay()).find('[data-drop-zone="tray"]').exists()).toBe(false)
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

    expect((await renderDay()).find('[data-drop-zone="tray"]').exists()).toBe(false)
  })

  it('offers a daily habit that was never placed, so it can be given an hour', async () => {
    // The tray used to read stored occurrences only, which meant the one thing the timeline
    // exists for was impossible until the habit had already been done.
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect((await openTray(await renderDay())).find('[data-drop-zone="tray"]').text()).toContain(
      'Meditate',
    )
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

    expect((await openTray(await renderDay())).find('[data-drop-zone="tray"]').text()).toContain(
      'Drink water',
    )
  })

  describe('grouped by routine', () => {
    function habitNamed(name: string) {
      return createCompletedHabit({
        id: newIdentifier(),
        name,
        frequency: frequency('daily', 1),
        createdOn: CREATED_ON,
      })
    }

    it('puts a heading above the chips a routine holds', async () => {
      const stretch = habitNamed('Stretch')
      const read = habitNamed('Read')

      await replaceDataset(persistence, {
        ...EMPTY_DATASET,
        habits: [stretch, read],
        routines: [
          createRoutine({
            id: newIdentifier(),
            name: 'Morning',
            habitIds: [stretch.id],
            createdOn: CREATED_ON,
          }),
        ],
      })

      const tray = (await openTray(await renderDay())).find('[data-drop-zone="tray"]')

      expect(tray.text()).toContain('Morning')
      // Whatever no routine claimed keeps its place, under no name of its own.
      expect(tray.text()).toContain('Anything else')
      expect(tray.text()).toContain('Read')
    })

    it('orders the chips as the routine does, not as the habits were stored', async () => {
      const stretch = habitNamed('Stretch')
      const read = habitNamed('Read')

      await replaceDataset(persistence, {
        ...EMPTY_DATASET,
        habits: [stretch, read],
        routines: [
          createRoutine({
            id: newIdentifier(),
            name: 'Morning',
            // Deliberately the reverse of the alphabet the picker would have used.
            habitIds: [stretch.id, read.id],
            createdOn: CREATED_ON,
          }),
        ],
      })

      const tray = (await openTray(await renderDay())).find('[data-drop-zone="tray"]')
      const names = tray.findAll('li').map((row) => row.text())

      expect(names.findIndex((text) => text.includes('Stretch'))).toBeLessThan(
        names.findIndex((text) => text.includes('Read')),
      )
    })

    it('draws no headings at all until a day has actually been arranged', async () => {
      // A single heading over everything is a heading that groups nothing.
      await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

      const tray = (await openTray(await renderDay())).find('[data-drop-zone="tray"]')

      expect(tray.text()).not.toContain('Anything else')
      expect(tray.text()).toContain('Stretch')
    })

    it('shows the hour the routine says it starts', async () => {
      const stretch = habitNamed('Stretch')
      const read = habitNamed('Read')

      await replaceDataset(persistence, {
        ...EMPTY_DATASET,
        habits: [stretch, read],
        routines: [
          createRoutine({
            id: newIdentifier(),
            name: 'Morning',
            habitIds: [stretch.id],
            createdOn: CREATED_ON,
            anchorTime: timeOfDay(6 * 60 + 30),
          }),
        ],
      })

      const tray = (await openTray(await renderDay())).find('[data-drop-zone="tray"]')

      expect(tray.text()).toContain('06:30')
    })

    it('leaves an archived routine out of the arrangement', async () => {
      const stretch = habitNamed('Stretch')

      await replaceDataset(persistence, {
        ...EMPTY_DATASET,
        habits: [stretch],
        routines: [
          createRoutine({
            id: newIdentifier(),
            name: 'Morning',
            habitIds: [stretch.id],
            createdOn: CREATED_ON,
            archivedOn: calendarDate('2026-03-01'),
          }),
        ],
      })

      const tray = (await openTray(await renderDay())).find('[data-drop-zone="tray"]')

      expect(tray.text()).not.toContain('Morning')
      expect(tray.text()).toContain('Stretch')
    })
  })
})

describe('a habit with a usual hour', () => {
  function meditateAtSeven() {
    return createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
      usualTime: timeOfDay(7 * 60),
    })
  }

  it('opens the day already on the ruler, without anything having been placed', async () => {
    // The whole point: a habit performed at seven every morning used to arrive with no time
    // every morning, and had to be dragged onto seven again each day.
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [meditateAtSeven()] })

    const card = (await renderDay()).find('[data-drop-zone="timeline"] .absolute.inset-x-1')

    expect(card.attributes('style')).toContain('top: 420px')
  })

  it('is not in the tray, having nowhere left to be placed', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [meditateAtSeven()] })

    expect((await renderDay()).find('[data-drop-zone="tray"]').exists()).toBe(false)
  })

  it('writes nothing until something about the day is actually changed', async () => {
    // A hour the habit states is not a record of a plan. Materialising one on sight would
    // fill the database with occurrences nobody made a decision about.
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [meditateAtSeven()] })
    await renderDay()

    expect(await persistence.instances.all()).toHaveLength(0)
  })

  it('lets today occurrence disagree with the usual hour', async () => {
    const habit = meditateAtSeven()
    const instance = scheduleAt(
      planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      timeOfDay(9 * 60),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const card = (await renderDay()).find('[data-drop-zone="timeline"] .absolute.inset-x-1')

    expect(card.attributes('style')).toContain('top: 540px')
  })

  it('stays loosened once it has been taken off the ruler', async () => {
    // An occurrence with no start is a decision — "not at the usual time today". Re-applying
    // the habit's hour over it would make loosening a card impossible.
    const habit = meditateAtSeven()
    const loosened = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: DAY,
      period: 'daily',
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [loosened] })

    const wrapper = await renderDay()

    expect(wrapper.find('[data-drop-zone="timeline"] .absolute.inset-x-1').exists()).toBe(false)
    expect(wrapper.text()).toContain('needs an hour')
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

  /** Named, because the slot sheet and the amount dialog are `<dialog>` elements too. */
  function sheet(wrapper: Awaited<ReturnType<typeof renderDay>>) {
    return wrapper.find('dialog[aria-label="Adjust this occurrence"]')
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
      .findAll('dialog[aria-label="Adjust this occurrence"] button')
      .find((node) => node.text() === label)
      ?.trigger('click')
    await settle()
  }

  it('offers the time, the length and the reminder, which is all an occurrence has', async () => {
    const text = sheet(await openSheet()).text()

    expect(text).toContain('Starts')
    expect(text).toContain('For how long')
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

describe('dragging the grip on a card', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  /**
   * A card starting at 07:00. Every rectangle in jsdom is at the origin and a minute is a
   * pixel, so a clientY reads directly as a minute of the day.
   */
  async function renderScheduled(durationMinutes = 30) {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
        durationMinutes,
      }),
      timeOfDay(7 * 60),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    return await renderDay()
  }

  /**
   * jsdom has no PointerEvent and refuses to have `clientY` assigned onto a MouseEvent after
   * construction, which is how the test helper would otherwise supply it, so the coordinate
   * goes in through the constructor.
   */
  function pointer(type: string, clientY: number) {
    return new MouseEvent(type, { clientY, bubbles: true })
  }

  function grip(wrapper: Awaited<ReturnType<typeof renderDay>>) {
    return wrapper.find('[data-edge="end"]').element
  }

  async function dragGripTo(wrapper: Awaited<ReturnType<typeof renderDay>>, clientY: number) {
    const handle = grip(wrapper)

    handle.dispatchEvent(pointer('pointerdown', 7 * 60 + 30))
    handle.dispatchEvent(pointer('pointermove', clientY))
    handle.dispatchEvent(pointer('pointerup', clientY))
    await settle()
  }

  it('offers a contact point on each edge, so a start moves without the finish', async () => {
    const wrapper = await renderScheduled()

    expect(wrapper.find('[data-edge="start"]').exists()).toBe(true)
    expect(wrapper.find('[data-edge="end"]').exists()).toBe(true)
  })

  it('makes the occurrence last until where the finger let go', async () => {
    const wrapper = await renderScheduled()

    await dragGripTo(wrapper, 8 * 60)

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(60)
  })

  it('leaves the start alone, because a grip on the bottom edge moves one edge', async () => {
    const wrapper = await renderScheduled()

    await dragGripTo(wrapper, 9 * 60)

    expect((await persistence.instances.all())[0]?.startsAt).toBe(7 * 60)
  })

  it('snaps to the same step the rest of the screen uses', async () => {
    const wrapper = await renderScheduled()

    // 08:07 is not a time this screen can express, so it lands on 08:00.
    await dragGripTo(wrapper, 8 * 60 + 7)

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(60)
  })

  it('refuses to shrink a card into nothing', async () => {
    const wrapper = await renderScheduled()

    // Dragged well above its own start, which has no meaningful length at all.
    await dragGripTo(wrapper, 5 * 60)

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(15)
  })

  it('grows the card while the finger is still down, before anything is saved', async () => {
    const wrapper = await renderScheduled()
    const handle = grip(wrapper)

    handle.dispatchEvent(pointer('pointerdown', 7 * 60 + 30))
    handle.dispatchEvent(pointer('pointermove', 9 * 60))
    await flushPromises()

    expect(wrapper.find('[aria-label="Adjust Meditate"]').text()).toContain('07:00 – 09:00')
    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(30)
  })

  it('does not open the sheet, so the two gestures never fight', async () => {
    const wrapper = await renderScheduled()

    await dragGripTo(wrapper, 8 * 60)

    expect(
      wrapper.find('dialog[aria-label="Adjust this occurrence"]').attributes('open'),
    ).toBeUndefined()
  })
})

describe('the time marker in the hour column', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  async function renderScheduled(startsAt = 7 * 60, durationMinutes = 30) {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
        durationMinutes,
      }),
      timeOfDay(startsAt),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    return await renderDay()
  }

  function marker(wrapper: Awaited<ReturnType<typeof renderDay>>) {
    return wrapper.find('[aria-label="Set the exact time of Meditate"]')
  }

  it('reads the occurrence its own start time', async () => {
    expect(marker(await renderScheduled()).text()).toBe('07:00')
  })

  it('sits level with the top edge of the card it belongs to', async () => {
    // The column is a ruler, so a marker that is not level with its card is simply wrong.
    expect(marker(await renderScheduled(9 * 60)).attributes('style')).toContain('top: 540px')
  })

  it('is a way into the editor, since a tap on the card competes with the drag', async () => {
    const wrapper = await renderScheduled()

    await marker(wrapper).trigger('click')
    await flushPromises()

    const editor = wrapper.find('dialog[aria-label="Adjust this occurrence"]')

    expect(editor.attributes('open')).toBeDefined()
    expect(editor.text()).toContain('Meditate')
  })

  it('shows nothing live until a gesture is actually happening', async () => {
    expect((await renderScheduled()).find('[data-live-time]').exists()).toBe(false)
  })

  it('calls out where a resize currently ends, while the finger is still down', async () => {
    const wrapper = await renderScheduled()
    const handle = wrapper.find('[data-edge="end"]').element

    handle.dispatchEvent(new MouseEvent('pointerdown', { clientY: 7 * 60 + 30, bubbles: true }))
    handle.dispatchEvent(new MouseEvent('pointermove', { clientY: 8 * 60 + 30, bubbles: true }))
    await flushPromises()

    expect(wrapper.find('[data-live-time]').text()).toBe('08:30')

    handle.dispatchEvent(new MouseEvent('pointerup', { clientY: 8 * 60 + 30, bubbles: true }))
    await settle()

    expect(wrapper.find('[data-live-time]').exists()).toBe(false)
  })
})

describe('typing an exact time', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  async function openEditor(startsAt = 7 * 60, durationMinutes = 30) {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
        durationMinutes,
      }),
      timeOfDay(startsAt),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const wrapper = await renderDay()

    await wrapper.find('[aria-label="Set the exact time of Meditate"]').trigger('click')
    await flushPromises()

    return wrapper
  }

  /** The label wrapping each field is the only thing separating them, so they go by index. */
  async function fill(field: ReturnType<typeof timeFields>[number], value: string) {
    await field.setValue(value)
    await field.trigger('change')
    await settle()
  }

  function timeFields(wrapper: Awaited<ReturnType<typeof renderDay>>) {
    return wrapper.findAll('dialog[aria-label="Adjust this occurrence"] input[type="time"]')
  }

  /** What the field currently shows, which is not the same as what the store holds. */
  function shownAt(wrapper: Awaited<ReturnType<typeof renderDay>>, index: number) {
    return (timeFields(wrapper)[index]?.element as HTMLInputElement | undefined)?.value
  }

  async function chooseMode(wrapper: Awaited<ReturnType<typeof renderDay>>, label: string) {
    await wrapper
      .findAll('dialog[aria-label="Adjust this occurrence"] [role="tab"]')
      .find((node) => node.text() === label)
      ?.trigger('click')
    await flushPromises()
  }

  it('offers the start already filled in, rather than an empty field', async () => {
    expect(shownAt(await openEditor(), 0)).toBe('07:00')
  })

  it('moves the occurrence to a minute the ruler cannot express', async () => {
    const wrapper = await openEditor()

    await fill(timeFields(wrapper)[0]!, '07:07')

    expect((await persistence.instances.all())[0]?.startsAt).toBe(7 * 60 + 7)
  })

  it('keeps the length when only the start moves', async () => {
    const wrapper = await openEditor(7 * 60, 45)

    await fill(timeFields(wrapper)[0]!, '10:20')

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(45)
  })

  it('ignores a field that is being cleared rather than writing nonsense', async () => {
    const wrapper = await openEditor()

    await fill(timeFields(wrapper)[0]!, '')

    expect((await persistence.instances.all())[0]?.startsAt).toBe(7 * 60)
  })

  it('takes a length by the moment it ends', async () => {
    const wrapper = await openEditor()

    await chooseMode(wrapper, 'Until')
    await fill(timeFields(wrapper)[1]!, '08:20')

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(80)
  })

  it('reads an end before the start as the next morning, as block time does', async () => {
    // Otherwise the one habit most worth planning past midnight cannot be entered at all.
    const wrapper = await openEditor(23 * 60)

    await chooseMode(wrapper, 'Until')
    await fill(timeFields(wrapper)[1]!, '01:00')

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(120)
  })

  it('takes a length in minutes directly', async () => {
    const wrapper = await openEditor()

    await fill(
      wrapper.find('dialog[aria-label="Adjust this occurrence"] input[type="number"]'),
      '37',
    )

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(37)
  })

  it('refuses a length of nothing', async () => {
    const wrapper = await openEditor(7 * 60, 30)

    await fill(
      wrapper.find('dialog[aria-label="Adjust this occurrence"] input[type="number"]'),
      '0',
    )

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(30)
  })

  it('shows the end that the current length implies, so the two agree', async () => {
    const wrapper = await openEditor(7 * 60, 90)

    await chooseMode(wrapper, 'Until')

    expect(shownAt(wrapper, 1)).toBe('08:30')
  })
})

describe('stretching the day', () => {
  async function renderScheduled() {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
        durationMinutes: 60,
      }),
      timeOfDay(9 * 60),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    return await renderDay()
  }

  function zoom(wrapper: Awaited<ReturnType<typeof renderDay>>, label: string) {
    return wrapper.find(`[aria-label="${label}"]`)
  }

  const closer = (wrapper: Awaited<ReturnType<typeof renderDay>>) =>
    zoom(wrapper, 'Closer view, finer steps')
  const wider = (wrapper: Awaited<ReturnType<typeof renderDay>>) =>
    zoom(wrapper, 'Wider view, coarser steps')

  function marker(wrapper: Awaited<ReturnType<typeof renderDay>>) {
    return wrapper.find('[aria-label="Set the exact time of Meditate"]')
  }

  it('opens on the ruler the screen was built around', async () => {
    expect((await renderScheduled()).text()).toContain('15 min')
  })

  it('names the step rather than the zoom, since the step is what can be saved', async () => {
    const wrapper = await renderScheduled()

    await closer(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('5 min')
  })

  it('moves every card down with the ruler it is measured against', async () => {
    const wrapper = await renderScheduled()

    expect(marker(wrapper).attributes('style')).toContain('top: 540px')

    await closer(wrapper).trigger('click')
    await flushPromises()

    expect(marker(wrapper).attributes('style')).toContain('top: 1080px')
  })

  it('shortens the day when asked for a wider view', async () => {
    const wrapper = await renderScheduled()

    await wider(wrapper).trigger('click')
    await flushPromises()

    expect(marker(wrapper).attributes('style')).toContain('top: 270px')
  })

  it('lands a drag on the finer step once the day is stretched', async () => {
    const wrapper = await renderScheduled()

    await closer(wrapper).trigger('click')
    await flushPromises()

    // On a doubled ruler 1210px is 10:05, a time the quarter hour step cannot express.
    const handle = wrapper.find('[data-edge="end"]').element

    handle.dispatchEvent(new MouseEvent('pointerdown', { clientY: 1080, bubbles: true }))
    handle.dispatchEvent(new MouseEvent('pointermove', { clientY: 1210, bubbles: true }))
    await flushPromises()

    expect(wrapper.find('[data-live-time]').text()).toBe('10:05')
  })

  it('refuses to go closer than the closest view', async () => {
    const wrapper = await renderScheduled()

    await closer(wrapper).trigger('click')
    await flushPromises()

    expect(closer(wrapper).attributes('disabled')).toBeDefined()
  })

  it('remembers the choice, since a ruler you keep re-picking is a ruler you resent', async () => {
    const first = await renderScheduled()

    await closer(first).trigger('click')
    await flushPromises()

    expect((await renderDay()).text()).toContain('5 min')
  })
})

describe('dragging the top edge', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  /** A card from 09:00 to 10:00, so the top edge has room to move in both directions. */
  async function renderScheduled() {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
        durationMinutes: 60,
      }),
      timeOfDay(9 * 60),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    return await renderDay()
  }

  function pointer(type: string, clientY: number) {
    return new MouseEvent(type, { clientY, bubbles: true })
  }

  async function dragTopTo(wrapper: Awaited<ReturnType<typeof renderDay>>, clientY: number) {
    const handle = wrapper.find('[data-edge="start"]').element

    handle.dispatchEvent(pointer('pointerdown', 9 * 60))
    handle.dispatchEvent(pointer('pointermove', clientY))
    handle.dispatchEvent(pointer('pointerup', clientY))
    await settle()
  }

  it('moves the start earlier', async () => {
    const wrapper = await renderScheduled()

    await dragTopTo(wrapper, 8 * 60)

    expect((await persistence.instances.all())[0]?.startsAt).toBe(8 * 60)
  })

  it('leaves the finish exactly where it was', async () => {
    // The whole reason a second grip exists. One grip can only ever change the length; a
    // start that drags its own end along with it has not moved anything.
    const wrapper = await renderScheduled()

    await dragTopTo(wrapper, 8 * 60)

    const stored = (await persistence.instances.all())[0]

    expect((stored?.startsAt ?? 0) + (stored?.durationMinutes ?? 0)).toBe(10 * 60)
  })

  it('grows the card when the start moves earlier', async () => {
    const wrapper = await renderScheduled()

    await dragTopTo(wrapper, 8 * 60)

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(120)
  })

  it('shrinks it when the start moves later', async () => {
    const wrapper = await renderScheduled()

    await dragTopTo(wrapper, 9 * 60 + 30)

    expect((await persistence.instances.all())[0]?.durationMinutes).toBe(30)
  })

  it('refuses to drag the start past its own finish', async () => {
    // Otherwise the card inverts and reads as ending before it began.
    const wrapper = await renderScheduled()

    await dragTopTo(wrapper, 11 * 60)

    const stored = (await persistence.instances.all())[0]

    expect(stored?.durationMinutes).toBe(15)
    expect(stored?.startsAt).toBe(10 * 60 - 15)
  })

  it('calls out the moving edge rather than the still one', async () => {
    const wrapper = await renderScheduled()
    const handle = wrapper.find('[data-edge="start"]').element

    handle.dispatchEvent(pointer('pointerdown', 9 * 60))
    handle.dispatchEvent(pointer('pointermove', 8 * 60))
    await flushPromises()

    expect(wrapper.find('[data-live-time]').text()).toBe('08:00')
  })
})

describe('claiming an empty hour', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  /** A daily habit with no time yet, so the tray has something to offer the slot. */
  async function renderUnplanned() {
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    return await renderDay()
  }

  function slotSheet(wrapper: Awaited<ReturnType<typeof renderDay>>) {
    return wrapper.findAll('dialog').find((node) => node.text().includes('adjustable'))
  }

  async function tapEmptyHourAt(wrapper: Awaited<ReturnType<typeof renderDay>>, clientY: number) {
    const canvas = wrapper.find('[data-drop-zone="timeline"]')

    await canvas.trigger('click', { clientY })
    await flushPromises()
  }

  it('marks the hour before asking what goes in it', async () => {
    const wrapper = await renderUnplanned()

    await tapEmptyHourAt(wrapper, 15 * 60)

    expect(wrapper.find('[data-empty-slot]').exists()).toBe(true)
  })

  it('offers what the day still owes', async () => {
    const wrapper = await renderUnplanned()

    await tapEmptyHourAt(wrapper, 15 * 60)

    expect(slotSheet(wrapper)?.text()).toContain('Meditate')
  })

  it('schedules the chosen habit at that hour', async () => {
    const wrapper = await renderUnplanned()

    await tapEmptyHourAt(wrapper, 15 * 60)
    await slotSheet(wrapper)
      ?.findAll('button')
      .find((node) => node.text() === 'Meditate')
      ?.trigger('click')
    await settle()

    expect((await persistence.instances.all())[0]?.startsAt).toBe(15 * 60)
  })

  it('writes nothing while the slot is only a question', async () => {
    const wrapper = await renderUnplanned()

    await tapEmptyHourAt(wrapper, 15 * 60)

    expect(await persistence.instances.all()).toEqual([])
  })

  it('lets go when it is dismissed, since backing out must cost nothing', async () => {
    const wrapper = await renderUnplanned()

    await tapEmptyHourAt(wrapper, 15 * 60)
    await slotSheet(wrapper)
      ?.findAll('button')
      .find((node) => node.text() === 'Cancel')
      ?.trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-empty-slot]').exists()).toBe(false)
    expect(await persistence.instances.all()).toEqual([])
  })

  it('ignores a tap that landed on something already there', async () => {
    // A card, a block band or a grip is not an empty hour, and claiming one under a card
    // would bury the card the tap was aimed at.
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      timeOfDay(9 * 60),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const wrapper = await renderDay()

    await wrapper.find('[aria-label="Adjust Meditate"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-empty-slot]').exists()).toBe(false)
  })
})

describe('the indicator and the drop agree', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  /** A card from 04:15 to 06:00, so grabbing it anywhere but its top edge is possible. */
  async function renderScheduled() {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({
        id: newIdentifier(),
        habitId: habit.id,
        date: DAY,
        period: 'daily',
        durationMinutes: 105,
      }),
      timeOfDay(4 * 60 + 15),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    return await renderDay()
  }

  function pointer(type: string, clientY: number) {
    return new MouseEvent(type, { clientY, bubbles: true })
  }

  /**
   * Carries the card by a point partway down it and reads what the gutter promises before
   * letting go, then what was actually stored.
   *
   * This is the test that was missing. The gutter read the finger's own time while the drop
   * subtracted where the card had been grabbed, so the indicator said one hour and the card
   * landed at another — and every existing test passed, because each half was correct on its
   * own and nothing compared them.
   */
  async function carry(
    wrapper: Awaited<ReturnType<typeof renderDay>>,
    grabAt: number,
    releaseAt: number,
  ) {
    const card = wrapper.find('[aria-label="Adjust Meditate"]').element.parentElement

    if (!card) throw new Error('No card found')

    // jsdom has no hit testing, and hit testing is how the gesture knows which zone the
    // finger is over. Supplying it is the one browser capability this test has to fake;
    // everything else — the geometry, the snapping, the write — is the real thing.
    const canvas = wrapper.find('[data-drop-zone="timeline"]').element

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => canvas,
    })

    card.dispatchEvent(pointer('pointerdown', grabAt))
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40))
    card.dispatchEvent(pointer('pointermove', releaseAt))
    await flushPromises()

    const promised = wrapper.find('[data-live-time]').text()

    card.dispatchEvent(pointer('pointerup', releaseAt))
    await settle()

    const stored = (await persistence.instances.all())[0]?.startsAt ?? -1

    return { promised, stored }
  }

  it('lands the card exactly where the gutter said it would', async () => {
    const wrapper = await renderScheduled()
    // Grabbed 45 minutes down the card, released with the finger at 06:45.
    const { promised, stored } = await carry(wrapper, 5 * 60, 6 * 60 + 45)

    expect(promised).toBe('06:00')
    expect(stored).toBe(6 * 60)
  })

  it('keeps the grabbed point under the finger rather than moving the top edge there', async () => {
    const wrapper = await renderScheduled()
    const { stored } = await carry(wrapper, 5 * 60, 6 * 60 + 45)

    // The finger was 45 minutes down the card; the card starts 45 minutes above the finger.
    expect(stored).toBe(6 * 60 + 45 - 45)
  })

  it('agrees whichever part of the card was grabbed', async () => {
    const wrapper = await renderScheduled()
    const { promised, stored } = await carry(wrapper, 4 * 60 + 15, 9 * 60)

    expect(promised).toBe('09:00')
    expect(stored).toBe(9 * 60)
  })
})

describe('a day with more than a drawer can show', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  /** Twelve unplaced habits: a plausible bad day, not a synthetic thousand. */
  async function renderCrowded(count = 12) {
    const habits = Array.from({ length: count }, (_, index) =>
      createCompletedHabit({
        id: newIdentifier(),
        name: `Habit number ${index + 1}`,
        frequency: frequency('daily', 1),
        createdOn: CREATED_ON,
      }),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits })

    return await renderDay()
  }

  async function openTray(wrapper: Awaited<ReturnType<typeof renderDay>>) {
    await wrapper
      .findAll('button')
      .find((node) => node.text().includes('need an hour'))
      ?.trigger('click')
    await flushPromises()

    return wrapper
  }

  it('says how many there are before opening anything', async () => {
    expect((await renderCrowded()).text()).toContain('12')
  })

  it('holds all of them rather than quietly showing the first few', async () => {
    // A drawer that truncates is a drawer that hides work while claiming to list it.
    const wrapper = await openTray(await renderCrowded())

    expect(wrapper.findAll('[data-drop-zone="tray"] li')).toHaveLength(12)
  })

  it('scrolls instead of growing over the ruler', async () => {
    // The one thing it must never do is cover the hours the chips are going onto.
    const wrapper = await openTray(await renderCrowded())
    const list = wrapper.find('[data-drop-zone="tray"] ul')

    // Bounded rather than a fixed height: it takes what the screen can spare and only starts
    // scrolling past that, so a day with three chips does not scroll for no reason.
    expect(list.classes().join(' ')).toContain('overflow-y-auto')
    expect(list.classes().some((name) => name.startsWith('max-h-'))).toBe(true)
  })

  it('closes when the backdrop behind it is tapped', async () => {
    const wrapper = await openTray(await renderCrowded())

    await wrapper.find('.backdrop-blur-sm').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-drop-zone="tray"]').isVisible()).toBe(false)
  })

  it('takes a habit off the day from the chip itself', async () => {
    const wrapper = await openTray(await renderCrowded(2))

    await wrapper.find('[aria-label^="Take Habit number 1"]').trigger('click')
    await settle()

    // Nothing was ever placed, so there is no record to remove: the day owes this through
    // the habit itself, and the chip stays until the habit is archived.
    expect(await persistence.instances.all()).toEqual([])
    expect(wrapper.findAll('[data-drop-zone="tray"] li')).toHaveLength(2)
  })
})

describe('taking an hour back', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  it('is offered on the card that has one', async () => {
    // Loosening used to need a drag onto a strip that only appears mid-drag, which is a
    // gesture you have to already know about.
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      timeOfDay(7 * 60),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const wrapper = await renderDay()

    await wrapper.find('[aria-label="Adjust Meditate"]').trigger('click')
    await flushPromises()

    await wrapper
      .findAll('dialog[aria-label="Adjust this occurrence"] button')
      .find((node) => node.text() === 'Take its hour away')
      ?.trigger('click')
    await settle()

    expect((await persistence.instances.all())[0]?.startsAt).toBeUndefined()
  })
})

describe('the drawer gets out of the way of its own chip', () => {
  it('closes the moment one is lifted, so the ruler is readable again', async () => {
    // The dimmed backdrop was staying across the very surface the chip is being carried to.
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderDay()

    await wrapper
      .findAll('button')
      .find((node) => node.text().includes('needs an hour'))
      ?.trigger('click')
    await flushPromises()

    expect(wrapper.find('.backdrop-blur-sm').exists()).toBe(true)

    const chip = wrapper.find('[data-drop-zone="tray"] .grippable').element

    chip.dispatchEvent(new MouseEvent('pointerdown', { clientY: 100, bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40))
    await flushPromises()

    expect(wrapper.find('.backdrop-blur-sm').exists()).toBe(false)
  })

  it('leaves the last hour of the day reachable above the system bar', async () => {
    // A ruler that ends flush with the viewport puts 23:00 exactly where a phone draws its
    // own back button.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderDay()
    const ruler = wrapper.find('[data-drop-zone="timeline"]').element.closest('.pb-28')

    expect(ruler).not.toBeNull()
  })
})

describe('carrying a chip out of the drawer', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  function pointer(type: string, clientY: number) {
    return new MouseEvent(type, { clientY, bubbles: true })
  }

  /**
   * The whole journey: open the drawer, hold a chip, carry it to an hour, let go.
   *
   * Tested end to end rather than in pieces because every failure this flow has had lived in
   * the seam between two parts that each worked — the drawer and the gesture, the indicator
   * and the drop.
   */
  async function carryChipTo(clientY: number) {
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderDay()

    await wrapper
      .findAll('button')
      .find((node) => node.text().includes('needs an hour'))
      ?.trigger('click')
    await flushPromises()

    const canvas = wrapper.find('[data-drop-zone="timeline"]').element

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => canvas,
    })

    const chip = wrapper.find('[data-drop-zone="tray"] .grippable').element

    chip.dispatchEvent(pointer('pointerdown', 900))
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40))
    chip.dispatchEvent(pointer('pointermove', clientY))
    await flushPromises()

    const promised = wrapper.find('[data-live-time]').exists()
      ? wrapper.find('[data-live-time]').text()
      : null

    chip.dispatchEvent(pointer('pointerup', clientY))
    await settle()

    return { wrapper, promised }
  }

  it('places the habit at the hour it was released on', async () => {
    const { promised } = await carryChipTo(9 * 60)

    expect(promised).toBe('09:00')
    expect((await persistence.instances.all())[0]?.startsAt).toBe(9 * 60)
  })

  it('leaves the drawer shut once the habit has an hour', async () => {
    // It was open to hand this over, and it has. Reopening onto a day it no longer has
    // anything to say about is the app answering a question that was already settled.
    const { wrapper } = await carryChipTo(9 * 60)

    expect(wrapper.find('[data-drop-zone="tray"]').exists()).toBe(false)
  })

  it('keeps the remove badge from arming a drag', async () => {
    // It is a button, not a handle. A press that landed on it started the lift as well, and
    // the first movement then cancelled both.
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderDay()

    await wrapper
      .findAll('button')
      .find((node) => node.text().includes('needs an hour'))
      ?.trigger('click')
    await flushPromises()

    const badge = wrapper.find('[aria-label^="Take Meditate"]')

    await badge.trigger('pointerdown')
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40))
    await flushPromises()

    expect(wrapper.find('[data-live-time]').exists()).toBe(false)
  })

  it('lifts the dim off the ruler the chip is being carried to', async () => {
    const habit = meditate()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderDay()

    await wrapper
      .findAll('button')
      .find((node) => node.text().includes('needs an hour'))
      ?.trigger('click')
    await flushPromises()

    const chip = wrapper.find('[data-drop-zone="tray"] .grippable').element

    chip.dispatchEvent(pointer('pointerdown', 900))
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40))
    await flushPromises()

    expect(wrapper.find('.backdrop-blur-sm').exists()).toBe(false)
  })
})

describe('a lift that ends without a drop', () => {
  function pointer(type: string, clientY: number) {
    return new MouseEvent(type, { clientY, bubbles: true })
  }

  async function liftAndThen(finish: (card: Element) => void) {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      timeOfDay(4 * 60 + 15),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    const wrapper = await renderDay()
    const canvas = wrapper.find('[data-drop-zone="timeline"]').element

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => canvas,
    })

    const card = wrapper.find('[aria-label="Adjust Meditate"]').element.parentElement

    if (!card) throw new Error('No card found')

    card.dispatchEvent(pointer('pointerdown', 4 * 60 + 15))
    await new Promise((resolve) => setTimeout(resolve, LONG_PRESS_MS + 40))
    card.dispatchEvent(pointer('pointermove', 4 * 60 + 30))
    await flushPromises()

    expect(wrapper.find('[data-live-time]').exists()).toBe(true)

    finish(card)

    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()

    return wrapper
  }

  it('clears the marker when the browser takes the gesture for a scroll', async () => {
    // `pointercancel` is what arrives when the page decides mid-hold that it was a scroll.
    // Only a completed drop used to tidy up, so the gutter kept a time nothing had moved to.
    const wrapper = await liftAndThen((card) => card.dispatchEvent(pointer('pointercancel', 0)))

    expect(wrapper.find('[data-live-time]').exists()).toBe(false)
  })

  it('clears it when the card is released onto nothing at all', async () => {
    const wrapper = await liftAndThen((card) => {
      Object.defineProperty(document, 'elementFromPoint', {
        configurable: true,
        value: () => null,
      })
      card.dispatchEvent(pointer('pointerup', 4 * 60 + 30))
    })

    expect(wrapper.find('[data-live-time]').exists()).toBe(false)
  })

  it('leaves the card exactly where it was', async () => {
    await liftAndThen((card) => card.dispatchEvent(pointer('pointercancel', 0)))

    expect((await persistence.instances.all())[0]?.startsAt).toBe(4 * 60 + 15)
  })
})

describe('a sheet opened from a card', () => {
  async function settle() {
    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  async function renderPlaced() {
    const habit = meditate()
    const instance = scheduleAt(
      planInstance({ id: newIdentifier(), habitId: habit.id, date: DAY, period: 'daily' }),
      timeOfDay(65),
    )

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit], instances: [instance] })

    return await renderDay()
  }

  it('lets the day move again once its hour is taken away', async () => {
    // The press that opened the sheet froze the day so it could not change under a moving
    // finger, and the release that would have thawed it never comes once a modal is up. The
    // card then stayed on the ruler after the record behind it had already been unscheduled.
    const wrapper = await renderPlaced()

    expect(wrapper.findAll('[aria-label="Adjust Meditate"]')).toHaveLength(1)

    // The press is the part that matters: it is what freezes the day. A bare click never
    // produced one, so a test written without it passed whether or not the freeze was
    // released — which is a test that proves nothing.
    const card = wrapper.find('[aria-label="Adjust Meditate"]').element.parentElement

    if (!card) throw new Error('No card found')

    card.dispatchEvent(new MouseEvent('pointerdown', { clientY: 65, bubbles: true }))
    await wrapper.find('[aria-label="Adjust Meditate"]').trigger('click')
    await flushPromises()

    await wrapper
      .findAll('dialog[aria-label="Adjust this occurrence"] button')
      .find((node) => node.text() === 'Take its hour away')
      ?.trigger('click')
    await settle()

    expect((await persistence.instances.all())[0]?.startsAt).toBeUndefined()
    expect(wrapper.findAll('[aria-label="Adjust Meditate"]')).toHaveLength(0)
  })

  it('offers the habit back in the drawer rather than losing it', async () => {
    const wrapper = await renderPlaced()

    await wrapper.find('[aria-label="Adjust Meditate"]').trigger('click')
    await flushPromises()
    await wrapper
      .findAll('dialog[aria-label="Adjust this occurrence"] button')
      .find((node) => node.text() === 'Take its hour away')
      ?.trigger('click')
    await settle()

    expect(wrapper.text()).toContain('needs an hour')
  })
})
