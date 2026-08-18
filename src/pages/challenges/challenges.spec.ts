import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { addDays, todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { abandonChallenge, type ChallengeDay } from '@modules/challenges/domain/challenge'
import {
  CHALLENGE_PRESETS,
  challengeFromPreset,
} from '@modules/challenges/domain/challenge-presets'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import ChallengesPage from './index.vue'

const HARD = CHALLENGE_PRESETS.find((preset) => preset.key === '75-hard')!
const GENTLE = CHALLENGE_PRESETS.find((preset) => preset.onMiss === 'continue')!

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  globalThis.localStorage?.clear()
  persistence = await createPersistence(`challenges-spec-${databaseCounter}`)
})

async function render() {
  const pinia = createPinia()

  setActivePinia(pinia)

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: ChallengesPage },
      { path: '/habits', component: ChallengesPage },
      { path: '/challenges', component: ChallengesPage },
    ],
  })

  await router.push('/challenges')
  await router.isReady()

  const wrapper = mount(ChallengesPage, {
    global: {
      plugins: [pinia, PiniaColada, router],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return { wrapper, feedback: useFeedback() }
}

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await flushPromises()
}

function started(preset = HARD, startedOn = todayIn()) {
  return challengeFromPreset(preset, {
    id: newIdentifier(),
    newTaskId: newIdentifier,
    startedOn,
  })
}

function dayOf(
  challenge: ReturnType<typeof started>,
  offset: number,
  done: 'all' | 'none',
): ChallengeDay {
  return {
    id: newIdentifier(),
    challengeId: challenge.id,
    date: addDays(challenge.startedOn, offset),
    completed: done === 'all' ? challenge.tasks.map((task) => task.id) : [],
    recordedAt: offset,
  }
}

describe('the programmes on offer', () => {
  it('lists every bundled one, with what it asks', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const text = (await render()).wrapper.text()

    expect(text).toContain(HARD.name)
    for (const task of HARD.tasks) expect(text).toContain(task)
  })

  it('says how long each one runs for', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render()).wrapper.text()).toContain('75 days')
  })

  it('states the punishment before the commitment, not after the first miss', async () => {
    // A programme that explained its rule only once it had been applied would be a trap.
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render()

    await page.wrapper.find(`[aria-label="Start ${HARD.name}"]`).trigger('click')
    await flushPromises()

    expect(page.feedback.request?.message).toContain('back to day one')
  })

  it('says plainly when a programme forgives a miss instead', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render()

    await page.wrapper.find(`[aria-label="Start ${GENTLE.name}"]`).trigger('click')
    await flushPromises()

    expect(page.feedback.request?.message).toContain('not a reset')
  })

  it('starts one today when the offer is accepted', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render()

    await page.wrapper.find(`[aria-label="Start ${HARD.name}"]`).trigger('click')
    await flushPromises()
    page.feedback.resolve(true)
    await settle()

    const [stored] = await persistence.challenges.all()

    expect(stored).toMatchObject({ name: HARD.name, lengthDays: 75, startedOn: todayIn() })
  })

  it('starts nothing when the offer is declined', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render()

    await page.wrapper.find(`[aria-label="Start ${HARD.name}"]`).trigger('click')
    await flushPromises()
    page.feedback.resolve(false)
    await settle()

    expect(await persistence.challenges.all()).toEqual([])
  })
})

describe('a programme already running', () => {
  it('says which day of it today is', async () => {
    const challenge = started(HARD, addDays(todayIn(), -2))

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      challenges: [challenge],
      challengeDays: [dayOf(challenge, 0, 'all'), dayOf(challenge, 1, 'all')],
    })

    expect((await render()).wrapper.text()).toContain('Day 3 of 75')
  })

  it('says how many times it has been restarted, rather than flattering the attempt', async () => {
    // The restart count is the whole difference between this and a streak.
    const challenge = started(HARD, addDays(todayIn(), -3))

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      challenges: [challenge],
      challengeDays: [
        dayOf(challenge, 0, 'all'),
        dayOf(challenge, 1, 'none'),
        dayOf(challenge, 2, 'all'),
      ],
    })

    expect((await render()).wrapper.text()).toContain('restarted 1 time')
  })

  it('gives up on one without deleting what was done', async () => {
    const challenge = started(HARD, addDays(todayIn(), -1))

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      challenges: [challenge],
      challengeDays: [dayOf(challenge, 0, 'all')],
    })

    const page = await render()

    await page.wrapper.find(`[aria-label="Actions for ${HARD.name}"]`).trigger('click')
    await flushPromises()
    await page.wrapper
      .findAll('dialog button')
      .find((node) => node.text().startsWith('Give up on it'))
      ?.trigger('click')
    await settle()

    expect((await persistence.challenges.all())[0]?.abandonedOn).toBe(todayIn())
    expect(await persistence.challengeDays.all()).toHaveLength(1)
  })

  it('takes its days with it when it is deleted', async () => {
    // An orphaned day is a record nobody can see or remove.
    const challenge = started(HARD, addDays(todayIn(), -1))

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      challenges: [challenge],
      challengeDays: [dayOf(challenge, 0, 'all')],
    })

    const page = await render()

    await page.wrapper.find(`[aria-label="Actions for ${HARD.name}"]`).trigger('click')
    await flushPromises()
    await page.wrapper
      .findAll('dialog button')
      .find((node) => node.text().startsWith('Delete'))
      ?.trigger('click')
    await flushPromises()
    page.feedback.resolve(true)
    await settle()

    expect(await persistence.challenges.all()).toEqual([])
    expect(await persistence.challengeDays.all()).toEqual([])
  })

  it('marks one given up on rather than hiding it', async () => {
    // Started yesterday, yesterday done, given up today — so nothing was missed before the
    // decision, and the day you stop is not a day you failed.
    const challenge = abandonChallenge(started(HARD, addDays(todayIn(), -1)), todayIn())

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      challenges: [challenge],
      challengeDays: [dayOf(challenge, 0, 'all')],
    })

    expect((await render()).wrapper.text()).toContain('Given up on day 1')
  })
})
