import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { usePreferences } from '@core/preferences-store'
import { isPositive } from '@modules/habits/domain/habit'
import { HABIT_IDEAS } from '@modules/habits/domain/idea-library'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import StartPage from './start.vue'

const FIRST = HABIT_IDEAS[0]!.ideas[0]!

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  globalThis.localStorage?.clear()
  persistence = await createPersistence(`start-spec-${databaseCounter}`)
  await replaceDataset(persistence, EMPTY_DATASET)
})

const NOWHERE = { template: '<p>Nowhere</p>' }

async function render() {
  const pinia = createPinia()

  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: NOWHERE },
      { path: '/start', component: StartPage },
      { path: '/habits/new', component: NOWHERE },
    ],
  })

  await router.push('/start')
  await router.isReady()

  const wrapper = mount(StartPage, {
    global: {
      plugins: [pinia, PiniaColada, router],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return { wrapper, router, preferences: usePreferences() }
}

type Page = Awaited<ReturnType<typeof render>>

async function settle() {
  for (let round = 0; round < 4; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

async function press(page: Page, label: string) {
  const button = page.wrapper
    .findAll('button')
    .find((node) => node.text().trim().startsWith(label))

  if (!button) throw new Error(`No button labelled ${label}.`)

  await button.trigger('click')
  await settle()
}

async function choose(page: Page, name: string) {
  await page.wrapper.get(`[aria-label="Add ${name}"]`).trigger('click')
  await flushPromises()
}

describe('the first run', () => {
  it('opens on something to choose rather than on a blank form', async () => {
    /*
     * The whole reason this screen exists. "Name a habit" is a reasonable instruction only
     * for somebody who already knows the answer, and it is the first thing the app has ever
     * said to them.
     */
    const { wrapper } = await render()

    expect(wrapper.text()).toContain(FIRST.name)
    expect(wrapper.text()).toContain(FIRST.why)
  })

  it('turns what was chosen into ordinary habits', async () => {
    const page = await render()

    await choose(page, FIRST.name)
    await press(page, 'Next')
    await press(page, 'Finish')

    const saved = await persistence.habits.all()

    expect(saved.map((habit) => habit.name)).toEqual([FIRST.name])
    // The reason travels with it, which is the half that survives the third week.
    expect(saved[0]!.description).toBe(FIRST.why)
  })

  it('gives the day its shape, which is the thing this app is actually about', async () => {
    const page = await render()

    await press(page, 'Next')
    await press(page, 'Finish')

    const blocks = await persistence.blocks.all()

    expect(blocks.map((block) => block.name).sort()).toEqual(['Sleep', 'Work'])
  })

  it('lets a block be dropped by somebody it does not describe', async () => {
    // Shift work, no work, a different night. A default that cannot be refused is a lie
    // written into somebody's day on their first minute with the app.
    const page = await render()

    await press(page, 'Next')
    await page.wrapper.get('[aria-label="Do not add Work"]').trigger('click')
    await press(page, 'Finish')

    expect((await persistence.blocks.all()).map((block) => block.name)).toEqual(['Sleep'])
  })

  it('lands on the day it just set up', async () => {
    const page = await render()

    await press(page, 'Next')
    await press(page, 'Finish')

    expect(page.router.currentRoute.value.path).toBe('/')
  })

  it('remembers that it ran, so it never opens twice', async () => {
    const page = await render()

    expect(page.preferences.started).toBe(false)

    await press(page, 'Next')
    await press(page, 'Finish')

    expect(page.preferences.started).toBe(true)
  })

  it('remembers it ran even when everything was skipped', async () => {
    // Somebody who skips has answered the question. Asking again tomorrow would be the app
    // refusing to hear no.
    const page = await render()

    await press(page, 'Skip')

    expect(page.preferences.started).toBe(true)
    expect(await persistence.habits.all()).toEqual([])
    expect(await persistence.blocks.all()).toEqual([])
    expect(page.router.currentRoute.value.path).toBe('/')
  })

  it('writes nothing at all until the last step, so backing out costs nothing', async () => {
    const page = await render()

    await choose(page, FIRST.name)
    await press(page, 'Next')

    expect(await persistence.habits.all()).toEqual([])
  })

  it('only offers habits it can actually build', async () => {
    const page = await render()

    await choose(page, FIRST.name)
    await press(page, 'Next')
    await press(page, 'Finish')

    const [saved] = await persistence.habits.all()

    expect(saved).toBeDefined()
    expect(isPositive(saved!) || saved!.polarity === 'negative').toBe(true)
  })
})
