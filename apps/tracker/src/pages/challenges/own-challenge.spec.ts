import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { todayIn } from '@shared/domain/calendar-date'
import { MAX_CHALLENGE_TASKS } from '@modules/challenges/domain/challenge'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import NewChallengePage from './new.vue'

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  globalThis.localStorage?.clear()
  persistence = await createPersistence(`own-challenge-spec-${databaseCounter}`)
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
      { path: '/challenges', component: NOWHERE },
      { path: '/challenges/new', component: NewChallengePage },
    ],
  })

  await router.push('/challenges')
  await router.isReady()
  await router.push('/challenges/new')

  const wrapper = mount(NewChallengePage, {
    global: {
      plugins: [pinia, PiniaColada, router],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return { wrapper, router }
}

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

type Wrapper = Awaited<ReturnType<typeof render>>['wrapper']

function rows(wrapper: Wrapper) {
  return wrapper.findAll('[data-task-row] input')
}

async function fill(wrapper: Wrapper, names: readonly string[]) {
  await wrapper.get('#challenge-name').setValue('Winter build')
  await wrapper.get('#challenge-length').setValue(30)

  for (const [index, name] of names.entries()) {
    await rows(wrapper)[index]!.setValue(name)
  }
}

async function submit(wrapper: Wrapper) {
  await wrapper.get('form').trigger('submit')
  await settle()
}

describe('writing a challenge of your own', () => {
  it('saves what was typed', async () => {
    const { wrapper } = await render()

    await fill(wrapper, ['Swim', 'Read'])
    await submit(wrapper)

    const [saved] = await persistence.challenges.all()

    expect(saved).toMatchObject({ name: 'Winter build', lengthDays: 30 })
    expect(saved!.tasks.map((task) => task.name)).toEqual(['Swim', 'Read'])
  })

  it('starts it today rather than asking for a date nobody has a reason to change', async () => {
    const { wrapper } = await render()

    await fill(wrapper, ['Swim'])
    await submit(wrapper)

    expect((await persistence.challenges.all())[0]!.startedOn).toBe(todayIn())
  })

  it('leaves the form for the list once it is saved', async () => {
    const { wrapper, router } = await render()

    await fill(wrapper, ['Swim'])
    await submit(wrapper)

    expect(router.currentRoute.value.path).toBe('/challenges')
  })

  it('offers somewhere to type without being asked, and more when it is', async () => {
    const { wrapper } = await render()

    const before = rows(wrapper).length

    expect(before).toBeGreaterThan(1)

    await wrapper.get('[aria-label="Add another thing"]').trigger('click')

    expect(rows(wrapper)).toHaveLength(before + 1)
  })

  it('stops offering rows once the model would refuse them', async () => {
    const { wrapper } = await render()

    for (let added = rows(wrapper).length; added < MAX_CHALLENGE_TASKS; added += 1) {
      await wrapper.get('[aria-label="Add another thing"]').trigger('click')
    }

    expect(rows(wrapper)).toHaveLength(MAX_CHALLENGE_TASKS)
    expect(wrapper.find('[aria-label="Add another thing"]').exists()).toBe(false)
  })

  it('ignores the rows left blank rather than refusing the whole thing', async () => {
    const { wrapper } = await render()

    await fill(wrapper, ['Swim', '', 'Read'])
    await submit(wrapper)

    expect((await persistence.challenges.all())[0]!.tasks.map((task) => task.name)).toEqual([
      'Swim',
      'Read',
    ])
  })

  /**
   * The punishment is chosen, and what it costs is written beside the choice.
   *
   * The same rule the presets follow: a programme that explained its rule only once it had
   * been applied would be a trap. Here you are writing the rule yourself, so the sentence
   * has to be next to the switch rather than in a confirmation afterwards.
   */
  it('says what each miss rule costs at the moment it is chosen', async () => {
    const { wrapper } = await render()

    const text = wrapper.get('fieldset[aria-label="What a missed day costs"]').text()

    expect(text).toMatch(/back to day one/i)
    expect(text).toMatch(/carries on|missed day is a missed day/i)
  })

  it('records the forgiving rule when it is the one chosen', async () => {
    const { wrapper } = await render()

    await fill(wrapper, ['Swim'])
    await wrapper.get('[aria-label="A missed day is just a missed day"]').trigger('click')
    await submit(wrapper)

    expect((await persistence.challenges.all())[0]!.onMiss).toBe('continue')
  })

  it('refuses to start unnamed, and says so instead of doing nothing', async () => {
    const { wrapper } = await render()

    await rows(wrapper)[0]!.setValue('Swim')
    await wrapper.get('#challenge-name').setValue('   ')
    await submit(wrapper)

    expect(await persistence.challenges.all()).toEqual([])
    expect(wrapper.get('[role="alert"]').text()).not.toBe('')
  })

  it('refuses one with nothing to do, and says so', async () => {
    const { wrapper } = await render()

    await wrapper.get('#challenge-name').setValue('Winter build')
    await submit(wrapper)

    expect(await persistence.challenges.all()).toEqual([])
    expect(wrapper.get('[role="alert"]').text()).not.toBe('')
  })

  it('states the commitment as it is being written', async () => {
    const { wrapper } = await render()

    await fill(wrapper, ['Swim', 'Read'])

    // Live rather than in a confirmation: the whole shape of the thing is two numbers and a
    // rule, and reading them back is what catches "30" typed where "300" was meant.
    expect(wrapper.get('[data-commitment]').text()).toMatch(/30 days/i)
    expect(wrapper.get('[data-commitment]').text()).toMatch(/2 things/i)
  })
})
