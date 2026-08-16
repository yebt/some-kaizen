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
import { interval, timeOfDay } from '@shared/domain/time-of-day'
import { createBlockTime } from '@modules/block-time/domain/block-time'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { recordCompleted } from '@modules/habits/domain/habit-entry'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import StatsPage from './stats.vue'

/**
 * A fixed Wednesday, at noon so no timezone drags it onto a neighbouring date.
 *
 * The screen reads the real clock, and every window and every weekday figure on it is
 * measured from that. Left real, this file would assert different things depending on the day
 * it ran — which is the failure mode this suite already hit once.
 */
const WEDNESDAY = new Date(2026, 7, 12, 12)

const CREATED_ON = calendarDate('2020-01-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: WEDNESDAY, shouldAdvanceTime: true })
  databaseCounter += 1
  globalThis.localStorage?.clear()
  persistence = await createPersistence(`stats-spec-${databaseCounter}`)
})

afterEach(() => {
  vi.useRealTimers()
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/stats', component: StatsPage },
      { path: '/habits/:id', component: StatsPage },
    ],
  })

  await router.push('/stats')
  await router.isReady()

  const wrapper = mount(StatsPage, {
    global: {
      plugins: [createPinia(), PiniaColada, router],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

function habitNamed(name: string) {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function on(habit: ReturnType<typeof habitNamed>, date: string, done: boolean) {
  return recordCompleted(newIdentifier(), habit, calendarDate(date), done)
}

/** Picks a window by the label on its tab. */
async function choose(wrapper: Awaited<ReturnType<typeof render>>, label: string) {
  const tab = wrapper.findAll('[role="tab"]').find((node) => node.text().trim() === label)

  if (!tab) throw new Error(`No window labelled ${label}. Saw: ${wrapper.text()}`)

  await tab.trigger('click')
  await flushPromises()
}

function figure(wrapper: Awaited<ReturnType<typeof render>>, label: string): string {
  const card = wrapper
    .find('[aria-label="Overall"]')
    .findAll('div')
    .find((node) => node.text().includes(label))

  if (!card) throw new Error(`No figure labelled ${label}. Saw: ${wrapper.text()}`)

  return card.text().replace(label, '').trim()
}

describe('with nothing tracked', () => {
  it('says so rather than showing a wall of zeroes', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render()).text()).toContain('Nothing to measure yet')
  })
})

describe('the window', () => {
  it('offers every span, including the whole history', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Meditate')] })

    const labels = (await render()).findAll('[role="tab"]').map((node) => node.text().trim())

    expect(labels).toEqual(['7d', '30d', '90d', '1y', 'All'])
  })

  it('opens on a span that can actually have moved since last time', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Meditate')] })

    const selected = (await render())
      .findAll('[role="tab"]')
      .find((node) => node.attributes('aria-selected') === 'true')

    expect(selected?.text().trim()).toBe('30d')
  })

  it('changes what is counted, which is the whole point of having one', async () => {
    // Two answered days a month apart. Seven days sees one of them; a year sees both.
    const habit = habitNamed('Meditate')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [on(habit, '2026-08-11', true), on(habit, '2026-06-11', true)],
    })

    const wrapper = await render()

    await choose(wrapper, '7d')
    expect(figure(wrapper, 'days recorded')).toBe('1')

    await choose(wrapper, '1y')
    expect(figure(wrapper, 'days recorded')).toBe('2')
  })

  it('counts days answered, not answers written', async () => {
    // Correcting the same day twice is bookkeeping, not effort.
    const habit = habitNamed('Meditate')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [
        recordCompleted(newIdentifier(), habit, calendarDate('2026-08-11'), true, {
          recordedAt: 1,
        }),
        recordCompleted(newIdentifier(), habit, calendarDate('2026-08-11'), false, {
          recordedAt: 2,
        }),
      ],
    })

    expect(figure(await render(), 'days recorded')).toBe('1')
  })
})

describe('the headline figures', () => {
  it('counts the habits still being tracked', async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habitNamed('Meditate'), habitNamed('Read')],
    })

    expect(figure(await render(), 'habits tracked')).toBe('2')
  })

  it('reports the hours a week the fixed day already claims', async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habitNamed('Meditate')],
      blocks: [
        createBlockTime({
          id: newIdentifier(),
          name: 'Work',
          span: interval(timeOfDay(9 * 60), 8 * 60),
          weekdays: [1, 2, 3, 4, 5],
          createdOn: CREATED_ON,
        }),
      ],
    })

    expect(figure(await render(), 'hours a week booked')).toBe('40')
  })
})

describe('across the week', () => {
  it('names the best and the worst day when the week is uneven', async () => {
    // The most actionable thing this screen can say, and the one a streak cannot.
    const habit = habitNamed('Meditate')

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

    const text = (await render()).text()

    expect(text).toContain('Best day')
    expect(text).toContain('Mon')
    expect(text).toContain('Tue')
  })

  it('refuses to name one on a flat week, because there is no pattern', async () => {
    const habit = habitNamed('Meditate')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [
        on(habit, '2026-08-10', true),
        on(habit, '2026-08-03', true),
        on(habit, '2026-08-11', true),
        on(habit, '2026-08-04', true),
      ],
    })

    const text = (await render()).text()

    expect(text).toContain('Not enough answered days')
    expect(text).not.toContain('Best day')
  })

  it('refuses to name one off a single answered day', async () => {
    const habit = habitNamed('Meditate')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [on(habit, '2026-08-10', true)],
    })

    expect((await render()).text()).not.toContain('Best day')
  })

  it('refuses to name one off two weekdays answered once each', async () => {
    // Two answered weekdays is not two data points about a week. The threshold has to survive
    // the aggregation across habits, or one good Monday and one bad Tuesday become a finding.
    const habit = habitNamed('Meditate')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [on(habit, '2026-08-10', true), on(habit, '2026-08-11', false)],
    })

    const text = (await render()).text()

    expect(text).toContain('Not enough answered days')
    expect(text).not.toContain('Best day')
  })

  it('draws a bar per weekday, each saying what it is made of', async () => {
    const habit = habitNamed('Meditate')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [on(habit, '2026-08-10', true), on(habit, '2026-08-03', false)],
    })

    const wrapper = await render()
    const bars = wrapper.find('[aria-label="Rate by day of the week"]').findAll('[role="img"]')

    expect(bars).toHaveLength(7)
    expect(bars.map((bar) => bar.attributes('aria-label'))).toContain('Mon: 50% of 2 days')
  })

  it('says nothing rather than zero for a weekday never answered', async () => {
    // Zero would read as "you fail every Thursday" when the truth is "you have not said".
    const habit = habitNamed('Meditate')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [on(habit, '2026-08-10', true)],
    })

    const week = (await render()).find('[aria-label="Rate by day of the week"]')
    const bars = week.findAll('[role="img"]')

    expect(bars.map((bar) => bar.attributes('aria-label'))).toContain('Thu: nothing answered')

    // And the figure above it reads as an absence rather than as a nought. The column is
    // found through its own bar rather than by position, so reordering the week cannot make
    // this quietly assert about a different day.
    const thursday = week
      .findAll('li')
      .find((column) => column.find('[role="img"]').attributes('aria-label')?.startsWith('Thu'))

    expect(thursday?.text()).toContain('—')
    expect(thursday?.text()).not.toContain('0%')
  })
})

describe('the per-habit list', () => {
  it('links each habit to its own page', async () => {
    const habit = habitNamed('Meditate')

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect((await render()).find(`a[href="/habits/${habit.id}"]`).exists()).toBe(true)
  })

  it('leaves out a habit that has been archived', async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [{ ...habitNamed('Retired'), archivedOn: calendarDate('2026-01-01') }],
    })

    expect((await render()).text()).toContain('Nothing to measure yet')
  })
})
