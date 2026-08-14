import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { addDays, calendarDate, toDate, todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { interval, timeOfDay } from '@shared/domain/time-of-day'
import { createBlockTime } from '@modules/block-time/domain/block-time'
import { createCompletedHabit, createNegativeHabit, frequency } from '@modules/habits/domain/habit'
import { latestEntryFor, recordCompleted } from '@modules/habits/domain/habit-entry'
import { planInstance } from '@modules/planning/domain/planned-instance'
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

/**
 * Keeps a finished row in the list, so a test about recording is not also a test about
 * where finished rows are displayed.
 */
function showFinishedRows() {
  globalThis.localStorage?.setItem(
    'some-kaisen.preferences',
    JSON.stringify({ clock: '24h', theme: 'system', timeline: 'normal', done: 'show' }),
  )
}

beforeEach(async () => {
  databaseCounter += 1
  globalThis.localStorage?.clear()
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

  it('asks about the unanswered negative habits, each naming its own day', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('did you avoid it?')
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
    showFinishedRows()
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
    showFinishedRows()
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

describe('the swipe reveal', () => {
  beforeEach(async () => {
    await replaceDataset(persistence, buildPreviewDataset())
  })

  it('keeps the row painted above the labels behind it', async () => {
    // A positioned element paints above a static one regardless of DOM order, so a row that
    // is not itself positioned lets the reveal layer draw over its own content. jsdom cannot
    // see paint order, so the structural condition that prevents it is asserted instead.
    const wrapper = await renderToday()
    const reveal = wrapper.find('[aria-hidden="true"].absolute')

    expect(reveal.exists()).toBe(true)

    const row = reveal.element.parentElement?.querySelector(':scope > div:not(.absolute)')

    expect(row?.className).toContain('relative')
  })
})

describe('a day with block time but no habits yet', () => {
  it('shows the schedule instead of pretending the day is empty', async () => {
    // Someone who entered their sleep and their work day first was being told "no habits"
    // over a schedule that already had something in it.
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      blocks: [
        createBlockTime({
          id: newIdentifier(),
          name: 'Work',
          span: interval(timeOfDay(9 * 60), 8 * 60),
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          createdOn: calendarDate('2020-01-01'),
        }),
      ],
    })

    const text = (await renderToday()).text()

    expect(text).not.toContain('No habits yet')
    expect(text).toContain('Schedule')
  })

  it('still invites a first habit when there is genuinely nothing at all', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await renderToday()).text()).toContain('No habits yet')
  })
})

describe('holding a row', () => {
  /** The hold outlasts a slow swipe on purpose, so the test has to outlast the hold. */
  const HOLD_MS = 380

  function wait(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  beforeEach(async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [
        createCompletedHabit({
          id: newIdentifier(),
          name: 'Meditate',
          frequency: frequency('daily', 1),
          createdOn: calendarDate('2020-01-01'),
        }),
      ],
    })
  })

  /**
   * The habit's own row, found through the button inside it.
   *
   * Not the first `.touch-pan-y` on the page: the week strip carries that class too, and
   * pressing it was quietly testing the wrong element.
   */
  function row(wrapper: Awaited<ReturnType<typeof renderToday>>) {
    const inner = wrapper.find('[aria-label="Open Meditate"]').element
    const found = inner.closest('.touch-pan-y')

    if (!found) throw new Error('No habit row found')

    return { element: found }
  }

  /**
   * The sheet, told apart from the amount dialog by the name it is labelled with.
   *
   * Both are `<dialog>` elements and both are always in the tree, so the label is the only
   * thing that distinguishes them; a closed sheet carries no name and so is not found here.
   */
  function menu(wrapper: Awaited<ReturnType<typeof renderToday>>) {
    return wrapper.find('dialog[aria-label="Meditate"]')
  }

  function press(element: Element, clientX: number, clientY = 100) {
    element.dispatchEvent(
      new MouseEvent('pointerdown', { clientX, clientY, bubbles: true, cancelable: true }),
    )
  }

  it('opens what can be done with the habit behind it', async () => {
    const wrapper = await renderToday()

    press(row(wrapper).element, 20)
    await wait(HOLD_MS + 60)
    await flushPromises()

    expect(menu(wrapper).attributes('open')).toBeDefined()
    expect(menu(wrapper).text()).toContain('Meditate')
  })

  it('offers a time and an edit, which are the two things Today cannot do itself', async () => {
    const wrapper = await renderToday()

    press(row(wrapper).element, 20)
    await wait(HOLD_MS + 60)
    await flushPromises()

    const text = menu(wrapper).text()

    expect(text).toContain('Give it a time')
    expect(text).toContain('Edit')
  })

  it('leaves a plain tap alone, which is still the way to open the habit', async () => {
    const wrapper = await renderToday()
    const element = row(wrapper).element

    press(element, 20)
    element.dispatchEvent(new MouseEvent('pointerup', { clientX: 20, clientY: 100, bubbles: true }))
    await wait(HOLD_MS + 60)
    await flushPromises()

    expect(menu(wrapper).exists()).toBe(false)
  })

  it('gives way to the swipe when the finger travels', async () => {
    // Both gestures are armed by the same press, so each has to disarm itself on the
    // evidence it is waiting for. A finger that moves is not holding.
    const wrapper = await renderToday()
    const element = row(wrapper).element

    press(element, 20)
    element.dispatchEvent(
      new MouseEvent('pointermove', { clientX: 90, clientY: 100, bubbles: true }),
    )
    await wait(HOLD_MS + 60)
    await flushPromises()

    expect(menu(wrapper).exists()).toBe(false)
  })
})

describe('finished days still waiting for a verdict', () => {
  const CREATED = calendarDate('2020-01-01')

  async function renderWithUnanswered() {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [createNegativeHabit({ id: newIdentifier(), name: 'Smoking', createdOn: CREATED })],
    })

    return await renderToday()
  }

  it('asks about more than the most recent one', async () => {
    // A weekend away used to leave Friday and Saturday permanently unanswerable: the screen
    // asked about Sunday, and answering it revealed Saturday only to bury Friday again.
    const wrapper = await renderWithUnanswered()

    expect(
      wrapper.findAll('button').filter((node) => node.text() === 'Yes').length,
    ).toBeGreaterThan(1)
  })

  it('says how many more are behind them', async () => {
    const wrapper = await renderWithUnanswered()

    expect(wrapper.text()).toContain('still')
  })

  it('stops asking about days too old to remember', async () => {
    const wrapper = await renderWithUnanswered()
    const asked = wrapper.findAll('[aria-labelledby="pending-heading"] li')

    expect(asked.every((row) => !row.text().includes('2020-'))).toBe(true)
  })

  it('asks about yesterday first, since it is the one anyone can answer', async () => {
    // The opposite order buried the only answerable day behind months of guesses.
    const wrapper = await renderWithUnanswered()
    const first = wrapper.find('[aria-labelledby="pending-heading"] li')

    expect(first.text()).toContain(addDays(todayIn(), -1))
  })
})

describe('reaching the timeline', () => {
  it('offers it beside the date rather than at the foot of the schedule', async () => {
    // Looking at the shape of a day is something you do instead of reading the list, not
    // after scrolling past all of it.
    await replaceDataset(persistence, buildPreviewDataset())

    const wrapper = await renderToday()

    expect(wrapper.find('[aria-label^="Open the timeline"]').exists()).toBe(true)
  })
})

describe('finished habits and the way back to them', () => {
  /** Seeded rather than clicked: this is about where a finished row goes, not how it got there. */
  async function renderWithOneDone() {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 2),
      createdOn: calendarDate('2020-01-01'),
    })
    const instance = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: todayIn(),
      period: 'daily',
    })

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      instances: [instance],
      entries: [
        recordCompleted(newIdentifier(), habit, todayIn(), true, { instanceId: instance.id }),
      ],
    })

    return await renderToday()
  }

  it('keeps a finished row at the end of the list by default, not out of it', async () => {
    // "At the end" has to mean at the end. The accordion is for `hidden` alone.
    const wrapper = await renderWithOneDone()

    expect(wrapper.text()).toContain('Meditate')
    expect(wrapper.find('button[aria-expanded]').exists()).toBe(false)
  })

  it('offers the divider that opens only once they are genuinely hidden', async () => {
    globalThis.localStorage?.setItem(
      'some-kaisen.preferences',
      JSON.stringify({ clock: '24h', theme: 'system', timeline: 'normal', done: 'hide' }),
    )

    const wrapper = await renderWithOneDone()

    expect(wrapper.find('button[aria-expanded]').exists()).toBe(true)
  })
})

describe('a gesture that cannot do anything', () => {
  it('answers on the row rather than at the other end of the screen', async () => {
    // By the time a toast is read the swipe has snapped back with nothing attached to it.
    await replaceDataset(persistence, buildPreviewDataset())

    const wrapper = await renderToday()

    // The refusal is a class on the row, which is the only part of it a test can see.
    expect(wrapper.html()).not.toContain('refuse')
  })
})

describe('a swipe towards the state a row is already in', () => {
  const DAY = todayIn()

  async function renderWith(done: boolean) {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: calendarDate('2020-01-01'),
    })
    const instance = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: DAY,
      period: 'daily',
    })

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      instances: [instance],
      entries: [recordCompleted(newIdentifier(), habit, DAY, done, { instanceId: instance.id })],
    })

    showFinishedRows()

    return await renderToday()
  }

  function row(wrapper: Awaited<ReturnType<typeof renderToday>>) {
    const inner = wrapper.find('[aria-label="Open Meditate"]').element
    const found = inner.closest('.touch-pan-y')

    if (!found) throw new Error('No habit row found')

    return found
  }

  async function swipe(element: Element, dx: number) {
    element.dispatchEvent(new MouseEvent('pointerdown', { clientX: 0, clientY: 0, bubbles: true }))
    element.dispatchEvent(new MouseEvent('pointermove', { clientX: dx, clientY: 0, bubbles: true }))
    element.dispatchEvent(new MouseEvent('pointerup', { clientX: dx, clientY: 0, bubbles: true }))

    for (let round = 0; round < 3; round += 1) {
      await flushPromises()
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    await flushPromises()
  }

  it('refuses to complete something already complete', async () => {
    const wrapper = await renderWith(true)
    const before = (await persistence.entries.all())[0]?.recordedAt

    await swipe(row(wrapper), 140)

    expect((await persistence.entries.all())[0]?.recordedAt).toBe(before)
  })

  it('refuses to take back a day already taken back', async () => {
    // The old check asked whether an entry existed, so the first "not yet" left a `missed`
    // behind and every one after it sailed through.
    const wrapper = await renderWith(false)
    const before = (await persistence.entries.all())[0]?.recordedAt

    await swipe(row(wrapper), -140)

    expect((await persistence.entries.all())[0]?.recordedAt).toBe(before)
  })

  it('still allows the swipe that changes something', async () => {
    const wrapper = await renderWith(true)

    await swipe(row(wrapper), -140)

    expect((await persistence.entries.all())[0]?.outcome).toBe('missed')
  })

  it('allows both once the setting says a habit may be done again', async () => {
    globalThis.localStorage?.setItem(
      'some-kaisen.preferences',
      JSON.stringify({
        clock: '24h',
        theme: 'system',
        timeline: 'normal',
        done: 'show',
        allowRedo: true,
      }),
    )

    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Meditate',
      frequency: frequency('daily', 1),
      createdOn: calendarDate('2020-01-01'),
    })
    const instance = planInstance({
      id: newIdentifier(),
      habitId: habit.id,
      date: DAY,
      period: 'daily',
    })

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      instances: [instance],
      entries: [
        recordCompleted(newIdentifier(), habit, DAY, true, {
          instanceId: instance.id,
          recordedAt: 1,
        }),
      ],
    })

    const wrapper = await renderToday()

    await swipe(row(wrapper), 140)

    expect((await persistence.entries.all())[0]?.recordedAt).not.toBe(1)
  })
})

describe('the ribbon of days', () => {
  it('reaches far past the week on screen, so scrolling has somewhere to go', async () => {
    // The two hand written versions moved a fixed set of seven days and had nothing to show
    // at the edges, so mid-gesture the strip slid away from empty space.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderToday()

    expect(wrapper.findAll('[data-day]').length).toBeGreaterThan(60)
  })

  it('scrolls inside itself rather than widening the page', async () => {
    // A flex item defaults to `min-width: auto` — at least as wide as its content — so four
    // months of days pushed the row past the screen and took the whole page sideways with it.
    // jsdom has no layout, so the class that prevents it is what can be checked here.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderToday()
    const ribbon = wrapper.find('[data-day]').element.parentElement

    expect(ribbon?.className).toContain('min-w-0')
    expect(ribbon?.className).toContain('overflow-x-auto')
  })

  it('leaves the chosen day alone when the ribbon moves', async () => {
    // Scrolling a calendar to look at next Tuesday is not a decision to work on next Tuesday.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderToday()
    const before = wrapper.find('h1 + p').text()

    await wrapper.find('[data-day]').trigger('scroll')
    await flushPromises()

    expect(wrapper.find('h1 + p').text()).toBe(before)
  })

  it('changes the day only when one is tapped', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderToday()
    const tomorrow = addDays(todayIn(), 1)

    await wrapper.find(`[data-day="${tomorrow}"] button`).trigger('click')
    await flushPromises()

    expect(wrapper.find('[aria-label="Back to today"], button').exists()).toBe(true)
    expect(wrapper.text()).toContain('Back to today')
  })

  it('offers no way back while nothing is lost', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderToday()

    expect(wrapper.text()).not.toContain('Back to today')
  })

  it('takes the day back to today and asks the ribbon to follow', async () => {
    // Two things, because either alone leaves you somewhere you did not ask to be: the day
    // without the view, or the view without the day.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderToday()
    const strip = wrapper.findComponent({ name: 'DateStrip' })
    const recentre = vi.fn<() => void>()

    Object.assign(strip.vm as object, { recentre })

    await wrapper.find(`[data-day="${addDays(todayIn(), 2)}"] button`).trigger('click')
    await flushPromises()

    await wrapper
      .findAll('button')
      .find((node) => node.text() === 'Back to today')
      ?.trigger('click')
    await flushPromises()

    expect(wrapper.find('h1 + p').text()).toContain(
      new Intl.DateTimeFormat(undefined, { day: 'numeric' }).format(toDate(todayIn())),
    )
  })

  it('stops offering the way back once the ribbon says the day is showing again', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderToday()
    const strip = wrapper.findComponent({ name: 'DateStrip' })

    await strip.vm.$emit('in-view', false)
    await flushPromises()
    expect(wrapper.text()).toContain('Back to today')

    await strip.vm.$emit('in-view', true)
    await flushPromises()
    expect(wrapper.text()).not.toContain('Back to today')
  })

  it('offers the way back when the ribbon is scrolled off the chosen day', async () => {
    // Two ways to be lost and only one used to count. Scrolling months away while still
    // working on today changes nothing, and left nothing on screen saying so.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderToday()

    await wrapper.findComponent({ name: 'DateStrip' }).vm.$emit('in-view', false)
    await flushPromises()

    expect(wrapper.text()).toContain('Back to today')
  })
})
