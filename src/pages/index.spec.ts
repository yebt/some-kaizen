import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { calendarDate, todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { latestEntryFor } from '@modules/habits/domain/habit-entry'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'
import { buildPreviewDataset } from '@shared/dev/preview-dataset'

import TodayPage from './index.vue'

/**
 * An integration test over the real IndexedDB adapter rather than a stubbed store.
 *
 * The screen's whole job is turning stored records into a readable day, so faking the
 * storage would test the half that cannot break.
 */
let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`today-spec-${databaseCounter}`)
})

/**
 * Lets the whole round trip finish: mutation, invalidation, refetch and re-render.
 *
 * flushPromises drains microtasks only, and IndexedDB resolves through timers, so a
 * refetch triggered by a mutation is still in flight when it returns.
 */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await flushPromises()
}

async function renderToday() {
  const wrapper = mount(TodayPage, {
    global: {
      plugins: [createPinia(), PiniaColada],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

describe('with a populated day', () => {
  beforeEach(async () => {
    await replaceDataset(persistence, buildPreviewDataset())
  })

  it('renders without throwing', async () => {
    const wrapper = await renderToday()

    expect(wrapper.find('h1').text()).toBe('Today')
  })

  it('shows block time and scheduled habits in one schedule', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('Schedule')
    expect(text).toContain('Work')
    expect(text).toContain('Sleep')
    expect(text).toContain('Meditate')
  })

  it('lists an occurrence with no time under what is due today', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('Due')
    expect(text).toContain('Drink water')
  })

  it('shows the quitting habits, which are never planned and never performed', async () => {
    // Otherwise a habit you are quitting leaves no trace on the day it is being tracked.
    const text = (await renderToday()).text()

    expect(text).toContain('Quitting')
    expect(text).toContain('Judged tomorrow morning')
  })

  it('asks about the most recent unanswered negative habit', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('Did you avoid it?')
    expect(text).toContain('Smoking')
  })

  it('orders the schedule chronologically', async () => {
    const times = (await renderToday())
      .findAll('ol li span:first-child')
      .map((node) => node.text())
      .filter((value) => /^\d{2}:\d{2}$/.test(value))

    expect(times).toEqual([...times].sort())
  })
})

describe('recording what happened', () => {
  let dataset: ReturnType<typeof buildPreviewDataset>

  beforeEach(async () => {
    dataset = buildPreviewDataset()
    await replaceDataset(persistence, dataset)
  })

  /** Looks a demo habit up by name, so a test reads by intent rather than by index. */
  function idOf(name: string) {
    const habit = dataset.habits.find((candidate) => candidate.name === name)

    if (!habit) throw new Error(`The demo dataset has no habit named ${name}.`)

    return habit.id
  }

  const meditateId = () => idOf('Meditate')
  const waterId = () => idOf('Drink water')

  /**
   * The negative verdict written most recently.
   *
   * Chosen by recordedAt rather than by list position, because storage returns rows keyed
   * by identifier and the demo data already contains an older verdict.
   */
  async function newestNegative() {
    const negatives = (await persistence.entries.all()).filter((entry) => entry.kind === 'negative')

    return negatives.reduce<(typeof negatives)[number] | undefined>(
      (newest, entry) => (!newest || entry.recordedAt >= newest.recordedAt ? entry : newest),
      undefined,
    )
  }

  it('records a clean day for a negative habit', async () => {
    const wrapper = await renderToday()

    await wrapper
      .findAll('button')
      .find((node) => node.text() === 'Yes')
      ?.trigger('click')
    await settle()

    expect((await newestNegative())?.outcome).toBe('avoided')
  })

  it('records a relapse when the day was not avoided', async () => {
    const wrapper = await renderToday()

    await wrapper
      .findAll('button')
      .find((node) => node.text() === 'No')
      ?.trigger('click')
    await settle()

    expect((await newestNegative())?.outcome).toBe('relapsed')
  })

  it('judges the finished day rather than today', async () => {
    const wrapper = await renderToday()

    await wrapper
      .findAll('button')
      .find((node) => node.text() === 'Yes')
      ?.trigger('click')
    await settle()

    expect((await newestNegative())?.date).not.toBe(todayIn())
  })

  it('marks a binary habit as done', async () => {
    const wrapper = await renderToday()

    await wrapper.find('[aria-label="Mark Meditate"]').trigger('click')
    await settle()

    const entry = latestEntryFor(await persistence.entries.all(), meditateId(), todayIn())

    expect(entry?.kind === 'positive' ? entry.outcome : undefined).toBe('done')
  })

  it('replaces the verdict when you change your mind, rather than piling answers up', async () => {
    // Appending would leave a dozen rows behind a dozen taps, and two answers written in
    // the same millisecond would leave "which one counts" decided by storage order.
    const wrapper = await renderToday()

    await wrapper.find('[aria-label="Mark Meditate"]').trigger('click')
    await settle()
    await wrapper.find('[aria-label="Mark Meditate"]').trigger('click')
    await settle()

    const stored = await persistence.entries.all()
    const mine = stored.filter(
      (entry) => entry.habitId === meditateId() && entry.date === todayIn(),
    )

    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({ outcome: 'missed' })
  })

  it('shows the verdict back on the card it belongs to', async () => {
    const wrapper = await renderToday()

    await wrapper.find('[aria-label="Mark Meditate"]').trigger('click')
    await settle()

    expect(wrapper.find('[aria-label="Mark Meditate"]').attributes('aria-pressed')).toBe('true')
  })

  it('records an amount for a measured habit', async () => {
    const wrapper = await renderToday()

    await wrapper.find('[aria-label="Log Drink water"]').trigger('click')
    await flushPromises()

    await wrapper.find('dialog input[type="number"]').setValue(2)
    await wrapper.find('dialog form').trigger('submit')
    await settle()

    const entry = latestEntryFor(await persistence.entries.all(), waterId(), todayIn())

    expect(entry?.kind === 'positive' ? entry.value : undefined).toBe(2)
  })

  it('grades a partial amount as partial rather than as a miss', async () => {
    const wrapper = await renderToday()

    await wrapper.find('[aria-label="Log Drink water"]').trigger('click')
    await flushPromises()

    // The demo goal is 2 litres with a minimum of 1.
    await wrapper.find('dialog input[type="number"]').setValue(1.5)
    await wrapper.find('dialog form').trigger('submit')
    await settle()

    const entry = latestEntryFor(await persistence.entries.all(), waterId(), todayIn())

    expect(entry?.kind === 'positive' ? entry.outcome : undefined).toBe('partial')
  })
})

describe('with nothing stored', () => {
  beforeEach(async () => {
    await replaceDataset(persistence, EMPTY_DATASET)
  })

  it('invites the user to add a habit rather than showing an empty schedule', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('No habits yet')
    expect(text).not.toContain('Swipe a row right')
  })
})

describe('a habit that was never placed on the calendar', () => {
  it('shows a daily habit today without anyone dragging it there', async () => {
    // Its period is the day, so there is no planning decision to make and demanding one
    // would mean dragging seven cards a week for something that happens every day.
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Stretch',
      frequency: frequency('daily', 1),
      createdOn: calendarDate('2020-01-01'),
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect((await renderToday()).text()).toContain('Stretch')
  })

  it('shows a daily habit once per repetition', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Stretch',
      frequency: frequency('daily', 3),
      createdOn: calendarDate('2020-01-01'),
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect((await renderToday()).findAll('[aria-label="Mark Stretch"]')).toHaveLength(3)
  })

  it('leaves a weekly habit off until it is placed, since that day is a real choice', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Run',
      frequency: frequency('weekly', 2),
      createdOn: calendarDate('2020-01-01'),
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect((await renderToday()).text()).not.toContain('Run')
  })

  it('creates the occurrence when it is marked, rather than demanding it be planned first', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Stretch',
      frequency: frequency('daily', 1),
      createdOn: calendarDate('2020-01-01'),
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderToday()

    await wrapper.find('[aria-label="Mark Stretch"]').trigger('click')
    await settle()

    const stored = await persistence.instances.all()

    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ habitId: habit.id, date: todayIn() })
    expect(latestEntryFor(await persistence.entries.all(), habit.id, todayIn())).toMatchObject({
      outcome: 'done',
    })
  })
})
