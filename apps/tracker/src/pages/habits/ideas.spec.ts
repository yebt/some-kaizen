import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { calendarDate, todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { archiveHabit, createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { allIdeas } from '@modules/habits/domain/habit-ideas'
import { HABIT_IDEAS } from '@modules/habits/domain/idea-library'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import IdeasPage from './ideas.vue'

const CREATED_ON = calendarDate('2020-01-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  globalThis.localStorage?.clear()
  persistence = await createPersistence(`ideas-spec-${databaseCounter}`)
})

async function render() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/habits', component: IdeasPage },
      { path: '/habits/ideas', component: IdeasPage },
    ],
  })

  await router.push('/habits/ideas')
  await router.isReady()

  const wrapper = mount(IdeasPage, {
    global: {
      plugins: [createPinia(), PiniaColada, router],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await flushPromises()
}

function habitNamed(name: string) {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

describe('the list of ideas', () => {
  it('offers every bundled idea', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const text = (await render()).text()

    for (const idea of allIdeas(HABIT_IDEAS)) expect(text).toContain(idea.name)
  })

  it('says why each one is worth doing, not only what it is', async () => {
    // A list of bare nouns is a list of chores, and chores are what people stop doing.
    await replaceDataset(persistence, EMPTY_DATASET)

    const text = (await render()).text()

    for (const idea of allIdeas(HABIT_IDEAS)) expect(text).toContain(idea.why)
  })

  it('says how often each one recurs, in the words the rest of the app uses', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const text = (await render()).text()

    expect(text).toContain('Once a day')
    expect(text).toContain('judged the morning after')
  })

  it('names the days for an idea that has already chosen them', async () => {
    // "Three times a week" and "Mon Wed Fri" are different plans, and the row has to say
    // which one it is offering.
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render()).text()).toContain('Mon Wed Fri')
  })

  it('offers a heading per category, and one that shows all of them', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const labels = (await render()).findAll('[role="tab"]').map((node) => node.text().trim())

    expect(labels[0]).toBe('All')
    for (const category of HABIT_IDEAS) expect(labels).toContain(category.name)
  })

  it('narrows to one heading when one is chosen', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render()
    const quitting = wrapper
      .findAll('[role="tab"]')
      .find((node) => node.text().trim() === 'Quitting')

    await quitting?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Smoking')
    expect(wrapper.text()).not.toContain('Drink water')
  })
})

describe('taking an idea', () => {
  it('stores it as an ordinary habit', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render()

    await wrapper.find('[aria-label="Add Read"]').trigger('click')
    await settle()

    const [stored] = await persistence.habits.all()

    expect(stored).toMatchObject({
      name: 'Read',
      polarity: 'positive',
      tracking: 'completed',
      createdOn: todayIn(),
    })
  })

  it('carries the length, so the routine builder works on it at once', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render()

    await wrapper.find('[aria-label="Add Read"]').trigger('click')
    await settle()

    expect((await persistence.habits.all())[0]).toMatchObject({ usualDurationMinutes: 20 })
  })

  it('stores a measured idea with its thresholds', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render()

    await wrapper.find('[aria-label="Add Drink water"]').trigger('click')
    await settle()

    expect((await persistence.habits.all())[0]).toMatchObject({
      tracking: 'measured',
      measure: { unit: 'litres', minimum: 1, goal: 2 },
    })
  })

  it('stores one to quit with no schedule at all', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render()

    await wrapper.find('[aria-label="Add Smoking"]').trigger('click')
    await settle()

    const [stored] = await persistence.habits.all()

    expect(stored).toMatchObject({ polarity: 'negative' })
    expect(stored).not.toHaveProperty('frequency')
  })

  it('stays on the screen, because taking several is the ordinary case', async () => {
    /*
     * This is the screen someone opens with nothing, so returning after each one would be the
     * app deciding they were finished.
     *
     * Asserted on the route rather than on the markup. This spec mounts the page directly
     * rather than through a router view, so navigating away leaves the component exactly
     * where it was — a test that looked for the next row would pass whether or not the screen
     * had left.
     */
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render()

    await wrapper.find('[aria-label="Add Read"]').trigger('click')
    await settle()

    expect(wrapper.vm.$router.currentRoute.value.path).toBe('/habits/ideas')
    expect(wrapper.find('[aria-label="Add Walk"]').exists()).toBe(true)
  })
})

describe('an idea already being tracked', () => {
  it('says so on the row rather than letting it be taken twice', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Read')] })

    const wrapper = await render()

    expect(wrapper.text()).toContain('Tracked')
    expect(wrapper.find('[aria-label="Add Read"]').exists()).toBe(false)
  })

  it('still offers the rest', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Read')] })

    expect((await render()).find('[aria-label="Add Walk"]').exists()).toBe(true)
  })

  it('offers one again once the habit that matched it was archived', async () => {
    // Greying out an idea because of a habit retired last year would be refusing a fresh
    // start on the grounds that you once gave up.
    const retired = archiveHabit(habitNamed('Read'), calendarDate('2026-01-01'))

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [retired] })

    expect((await render()).find('[aria-label="Add Read"]').exists()).toBe(true)
  })

  it('marks it as tracked the moment it is taken, without a reload', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render()

    await wrapper.find('[aria-label="Add Read"]').trigger('click')
    await settle()

    expect(wrapper.find('[aria-label="Add Read"]').exists()).toBe(false)
    expect(await persistence.habits.all()).toHaveLength(1)
  })
})
