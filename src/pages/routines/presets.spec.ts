import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { PLATFORM_KEY, type PlatformServices } from '@core/platform-context'
import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { useFeedback } from '@shared/ui/feedback/feedback-store'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { ROUTINE_PRESETS } from '@modules/habits/domain/preset-library'
import { createRoutine } from '@modules/habits/domain/routine'
import { writeSharedRoutine } from '@modules/habits/domain/routine-share'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import PresetsPage from './presets.vue'

const CREATED_ON = calendarDate('2020-01-01')
const CALM = ROUTINE_PRESETS.find((preset) => preset.key === 'calm-15')!

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  globalThis.localStorage?.clear()
  persistence = await createPersistence(`presets-spec-${databaseCounter}`)
})

/**
 * Mounts the screen and hands back the feedback store with it.
 *
 * The confirmation dialog is rendered by `FeedbackHost` at the root of the app, not inside
 * this page, so there is no button here to press. The store is the seam: the screen asks
 * through it and this drives the answer, which is also the only way to read back the exact
 * question that was asked.
 */
/**
 * A platform whose file picker hands back whatever a test put in it.
 *
 * The picker is the only way a routine somebody else wrote gets in, so it is also the only
 * place a test can stand to prove that what arrives is read rather than trusted.
 */
function stubPlatform(picked: string | null): PlatformServices & { saved: string[] } {
  const saved: string[] = []

  return {
    saved,
    files: {
      save: async (_name, contents) => {
        saved.push(contents)
      },
      pick: async () => picked,
    },
    reminders: {
      ensurePermission: async () => 'unsupported',
      sync: async () => undefined,
    },
  }
}

async function render(picked: string | null = null) {
  const pinia = createPinia()

  setActivePinia(pinia)

  const instance = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/routines', component: PresetsPage },
      { path: '/routines/presets', component: PresetsPage },
    ],
  })

  await instance.push('/routines/presets')
  await instance.isReady()

  const wrapper = mount(PresetsPage, {
    global: {
      plugins: [pinia, PiniaColada, instance],
      provide: {
        [PERSISTENCE_KEY as symbol]: persistence,
        [PLATFORM_KEY as symbol]: stubPlatform(picked),
      },
    },
  })

  await flushPromises()

  return { wrapper, feedback: useFeedback() }
}

/** Lets a mutation, its invalidation and the refetch behind it all finish. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await flushPromises()
}

async function add(page: Awaited<ReturnType<typeof render>>, name: string) {
  await page.wrapper.find(`[aria-label="Add ${name}"]`).trigger('click')
  await flushPromises()
}

async function answer(page: Awaited<ReturnType<typeof render>>, accepted: boolean) {
  page.feedback.resolve(accepted)
  await settle()
}

describe('the preset library', () => {
  it('offers every bundled routine', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const text = (await render()).wrapper.text()

    for (const preset of ROUTINE_PRESETS) expect(text).toContain(preset.name)
  })

  it('shows what each one is made of before it is chosen', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const text = (await render()).wrapper.text()

    for (const step of CALM.steps) expect(text).toContain(step.name)
  })

  it('says how long the whole thing takes, which is what people judge it by', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render()).wrapper.text()).toContain('15 min')
  })

  it('says up front which habits it would reuse rather than create', async () => {
    // Someone who already stretches should see that theirs is what goes in, before tapping.
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

    expect((await render()).wrapper.text()).toContain('already track')
  })

  it('says nothing about reuse when there is nothing to reuse', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render()).wrapper.text()).not.toContain('already track')
  })
})

function habitNamed(name: string) {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

describe('adding a preset', () => {
  it('creates the habits it needs and the routine holding them', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render()

    await add(page, CALM.name)
    await answer(page, true)

    const habits = await persistence.habits.all()
    const [routine] = await persistence.routines.all()

    expect(habits.map((habit) => habit.name).sort()).toEqual(
      CALM.steps.map((step) => step.name).sort(),
    )
    expect(routine?.name).toBe(CALM.name)
    expect(routine?.habitIds).toHaveLength(CALM.steps.length)
  })

  it('gives each created habit the length the preset states, so it can be built at once', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render()

    await add(page, CALM.name)
    await answer(page, true)

    expect(
      (await persistence.habits.all()).find((habit) => habit.name === 'Breathe'),
    ).toMatchObject({ usualDurationMinutes: 5 })
  })

  it('reuses a habit already tracked rather than creating a second of the same name', async () => {
    const stretch = habitNamed('Stretch')

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [stretch] })

    const page = await render()

    await add(page, CALM.name)
    await answer(page, true)

    const stored = await persistence.habits.all()

    expect(stored.filter((habit) => habit.name === 'Stretch')).toHaveLength(1)
    // Untouched: reusing means taking the habit, not rewriting it from a template.
    expect(stored.find((habit) => habit.id === stretch.id)).toEqual(stretch)
    expect((await persistence.routines.all())[0]?.habitIds).toContain(stretch.id)
  })

  it('takes a reused habit out of the routine that had it', async () => {
    const stretch = habitNamed('Stretch')
    const evening = createRoutine({
      id: newIdentifier(),
      name: 'Evening',
      habitIds: [stretch.id],
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [evening],
    })

    const page = await render()

    await add(page, CALM.name)
    await answer(page, true)

    expect(
      (await persistence.routines.all()).find((one) => one.id === evening.id)?.habitIds,
    ).toEqual([])
  })

  it('carries the preset’s hour onto the routine it creates', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render()

    await add(page, CALM.name)
    await answer(page, true)

    expect((await persistence.routines.all())[0]).toMatchObject({ anchorTime: 7 * 60 })
  })

  it('names the habits it is about to reuse, so the merge is believable', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

    const page = await render()

    await add(page, CALM.name)

    expect(page.feedback.request?.message).toContain('Stretch')
    expect(page.feedback.request?.message).toContain('already recorded')
  })

  it('writes nothing at all when the question is answered no', async () => {
    // The offer is a question. Answering no has to leave the app exactly as it was, or the
    // question was decoration.
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render()

    await add(page, CALM.name)
    await answer(page, false)

    expect(await persistence.habits.all()).toEqual([])
    expect(await persistence.routines.all()).toEqual([])
  })
})

/**
 * A routine somebody else wrote, arriving through the same door as the bundled ones.
 *
 * That is the trust model rather than a convenience. A shared routine is a recipe — names,
 * lengths, an hour — with no identifiers, no dates and no way of naming anything already
 * here. It becomes a preset, and the preset import mints every identifier locally and shows
 * what it will create and reuse before writing. So a stranger's routine is exactly as
 * trusted as one this app ships, which is to say not at all.
 */
function sharedMorning() {
  const stretch = createCompletedHabit({
    id: newIdentifier(),
    name: 'Stretch',
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
    usualDurationMinutes: 10,
  })

  const routine = createRoutine({
    id: newIdentifier(),
    name: 'Their morning',
    habitIds: [stretch.id],
    createdOn: CREATED_ON,
  })

  return writeSharedRoutine(routine, [stretch])
}

async function openShared(page: Awaited<ReturnType<typeof render>>) {
  await page.wrapper.get('[aria-label="Open a shared routine"]').trigger('click')
  await settle()
}

describe('a routine from a file', () => {
  it('is offered beside the bundled ones once it has been opened', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render(sharedMorning())

    expect(page.wrapper.text()).not.toContain('Their morning')

    await openShared(page)

    expect(page.wrapper.text()).toContain('Their morning')
  })

  it('lands as ordinary habits and an ordinary routine', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render(sharedMorning())

    await openShared(page)
    await add(page, 'Their morning')
    await answer(page, true)

    expect((await persistence.habits.all()).map((habit) => habit.name)).toEqual(['Stretch'])
    expect((await persistence.routines.all()).map((routine) => routine.name)).toEqual([
      'Their morning',
    ])
  })

  it('takes the habit you already track rather than making a second one', async () => {
    // The merge that makes the bundled presets worth having applies unchanged, because what
    // arrived is a preset. Someone who already stretches keeps their history.
    const mine = createCompletedHabit({
      id: newIdentifier(),
      name: 'stretch',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [mine] })

    const page = await render(sharedMorning())

    await openShared(page)
    await add(page, 'Their morning')
    await answer(page, true)

    expect(await persistence.habits.all()).toHaveLength(1)
    expect((await persistence.routines.all())[0]!.habitIds).toEqual([mine.id])
  })

  it('says what it could not read instead of failing silently', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render('{"format":"nonsense"}')

    await openShared(page)

    expect(page.feedback.toasts.at(-1)?.tone).toBe('danger')
    expect(page.wrapper.text()).not.toContain('Their morning')
  })

  it('does nothing at all when the picker is backed out of', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const page = await render(null)

    await openShared(page)

    expect(page.feedback.toasts).toEqual([])
  })
})
