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
import { timeOfDay } from '@shared/domain/time-of-day'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { createCompletedHabit, createNegativeHabit, frequency } from '@modules/habits/domain/habit'
import { createRoutine } from '@modules/habits/domain/routine'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import RoutinesPage from './index.vue'
import NewRoutinePage from './new.vue'

const CREATED_ON = calendarDate('2020-01-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`routines-spec-${databaseCounter}`)
})

/** Records what the screen wrote out, which is the only way to read a shared routine back. */
function stubPlatform(): PlatformServices & { saved: { name: string; contents: string }[] } {
  const saved: { name: string; contents: string }[] = []

  return {
    saved,
    files: {
      save: async (name, contents) => {
        saved.push({ name, contents })
      },
      pick: async () => null,
    },
    reminders: {
      ensurePermission: async () => 'unsupported',
      sync: async () => undefined,
    },
  }
}

let platform: ReturnType<typeof stubPlatform>

async function render(component: typeof RoutinesPage | typeof NewRoutinePage) {
  platform = stubPlatform()

  const instance = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/habits', component: RoutinesPage },
      { path: '/routines', component: RoutinesPage },
      { path: '/routines/new', component: NewRoutinePage },
    ],
  })

  await instance.push('/routines')
  await instance.isReady()

  const wrapper = mount(component, {
    global: {
      plugins: [createPinia(), PiniaColada, instance],
      provide: {
        [PERSISTENCE_KEY as symbol]: persistence,
        [PLATFORM_KEY as symbol]: platform,
      },
    },
  })

  await flushPromises()

  return wrapper
}

/**
 * Taps the chip for a habit by name.
 *
 * By name rather than by index: the picker's order is the habits' own, so an index-based
 * test can assert an order the form never chose and pass whatever the buttons do.
 */
async function choose(wrapper: ReturnType<typeof mount>, name: string) {
  const chip = wrapper.findAll('ul button').find((button) => button.text().startsWith(name))

  if (!chip) throw new Error(`No chip offering ${name}.`)

  await chip.trigger('click')
}

/** The chosen habits, in the order the form is showing them. */
function steps(wrapper: ReturnType<typeof mount>): string[] {
  return wrapper.findAll('ol li').map((step) => step.text().replace(/^\d+\s*/, ''))
}

function habitNamed(name: string, id: Identifier = newIdentifier()) {
  return createCompletedHabit({
    id,
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function routineOf(
  name: string,
  habitIds: Identifier[],
  options: { archivedOn?: string; anchorTime?: number } = {},
) {
  return createRoutine({
    id: newIdentifier(),
    name,
    habitIds,
    createdOn: CREATED_ON,
    ...(options.anchorTime === undefined ? {} : { anchorTime: timeOfDay(options.anchorTime) }),
    archivedOn: options.archivedOn === undefined ? undefined : calendarDate(options.archivedOn),
  })
}

describe('the routine list', () => {
  it('says what a routine is for when there are none', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render(RoutinesPage)).text()).toContain('No routines yet')
  })

  it('counts what each one holds', async () => {
    const stretch = habitNamed('Stretch')
    const read = habitNamed('Read')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch, read],
      routines: [routineOf('Morning', [stretch.id, read.id])],
    })

    const text = (await render(RoutinesPage)).text()

    expect(text).toContain('Morning')
    expect(text).toContain('2 habits')
  })

  it('counts only the habits that still exist', async () => {
    // A habit deleted since leaves its identifier in the routine. Counting it would have the
    // screen claim two while showing one, which is how a list stops being believed.
    const stretch = habitNamed('Stretch')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routineOf('Morning', [stretch.id, newIdentifier()])],
    })

    expect((await render(RoutinesPage)).text()).toContain('1 habit')
  })

  it('marks an archived routine rather than hiding it', async () => {
    const stretch = habitNamed('Stretch')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routineOf('Morning', [stretch.id], { archivedOn: '2020-06-01' })],
    })

    expect((await render(RoutinesPage)).text()).toContain('archived')
  })

  it('says how many habits no routine has claimed', async () => {
    const stretch = habitNamed('Stretch')
    const read = habitNamed('Read')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch, read],
      routines: [routineOf('Morning', [stretch.id])],
    })

    expect((await render(RoutinesPage)).text()).toContain('1 habit belongs to no routine')
  })
})

describe('creating a routine', () => {
  it('offers the habits that could join it', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

    expect((await render(NewRoutinePage)).text()).toContain('Stretch')
  })

  it('never offers a habit you are quitting, which is never performed', async () => {
    const smoking = createNegativeHabit({
      id: newIdentifier(),
      name: 'Smoking',
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [smoking] })

    expect((await render(NewRoutinePage)).text()).not.toContain('Smoking')
  })

  it('names where a habit already is, before it is chosen', async () => {
    const stretch = habitNamed('Stretch')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routineOf('Morning', [stretch.id])],
    })

    expect((await render(NewRoutinePage)).text()).toContain('in Morning')
  })

  it('keeps the chosen habits in the order they were chosen', async () => {
    const stretch = habitNamed('Stretch')
    const read = habitNamed('Read')

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [stretch, read] })

    const wrapper = await render(NewRoutinePage)

    // Chosen in the opposite order to the one they are listed in, which is the only way to
    // tell "the order you chose" apart from "the order they happened to be in".
    await choose(wrapper, 'Stretch')
    await choose(wrapper, 'Read')

    expect(steps(wrapper)).toEqual(['Stretch', 'Read'])
    expect(wrapper.find('[aria-label="Take Stretch out"]').exists()).toBe(true)
  })

  it('moves a step later, swapping it with the one that followed', async () => {
    const stretch = habitNamed('Stretch')
    const read = habitNamed('Read')

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [stretch, read] })

    const wrapper = await render(NewRoutinePage)

    await choose(wrapper, 'Stretch')
    await choose(wrapper, 'Read')
    await wrapper.find('[aria-label="Move Stretch later"]').trigger('click')

    expect(steps(wrapper)).toEqual(['Read', 'Stretch'])
  })

  it('moves a step earlier, which is the same move read the other way', async () => {
    const stretch = habitNamed('Stretch')
    const read = habitNamed('Read')

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [stretch, read] })

    const wrapper = await render(NewRoutinePage)

    await choose(wrapper, 'Stretch')
    await choose(wrapper, 'Read')
    await wrapper.find('[aria-label="Move Read earlier"]').trigger('click')

    expect(steps(wrapper)).toEqual(['Read', 'Stretch'])
  })

  it('cannot move the first step earlier, since there is nowhere earlier', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

    const wrapper = await render(NewRoutinePage)

    await choose(wrapper, 'Stretch')

    expect(wrapper.find('[aria-label="Move Stretch earlier"]').attributes('disabled')).toBeDefined()
  })

  it('takes a habit back out, returning it to the ones on offer', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

    const wrapper = await render(NewRoutinePage)

    await choose(wrapper, 'Stretch')
    await wrapper.find('[aria-label="Take Stretch out"]').trigger('click')

    expect(steps(wrapper)).toEqual([])
    expect(wrapper.text()).toContain('Nothing in it yet')
  })

  it('saves the routine and moves its habits out of where they were', async () => {
    const stretch = habitNamed('Stretch')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routineOf('Morning', [stretch.id])],
    })

    const wrapper = await render(NewRoutinePage)

    await wrapper.find('input[type="text"]').setValue('Wind down')
    // By name, like everywhere else in this file: a positional pick reads whatever chip
    // happens to be first, which stops being the one the assertion is about the moment the
    // picker gains another habit.
    await choose(wrapper, 'Stretch')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const saved = await persistence.routines.all()
    const morning = saved.find((routine) => routine.name === 'Morning')
    const windDown = saved.find((routine) => routine.name === 'Wind down')

    // The rule is about the set: gaining a habit and losing it are one write.
    expect(windDown?.habitIds).toEqual([stretch.id])
    expect(morning?.habitIds).toEqual([])
  })

  it('refuses a routine with no name, and says so on the form', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

    const wrapper = await render(NewRoutinePage)

    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('needs a name')
    expect(await persistence.routines.all()).toHaveLength(0)
  })
})

describe('the hour a routine starts', () => {
  it('is shown beside what it holds', async () => {
    const stretch = habitNamed('Stretch')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routineOf('Morning', [stretch.id], { anchorTime: 6 * 60 + 30 })],
    })

    expect((await render(RoutinesPage)).text()).toContain('06:30')
  })

  it('orders the list the way the day runs, not the way it was built', async () => {
    // A list ordered differently from the thing it describes is a list you have to translate.
    const stretch = habitNamed('Stretch')
    const unwind = habitNamed('Unwind')

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch, unwind],
      routines: [
        routineOf('Wind down', [unwind.id], { anchorTime: 21 * 60 }),
        routineOf('Morning', [stretch.id], { anchorTime: 6 * 60 }),
      ],
    })

    const names = (await render(RoutinesPage)).findAll('li').map((row) => row.text())

    expect(names.findIndex((text) => text.includes('Morning'))).toBeLessThan(
      names.findIndex((text) => text.includes('Wind down')),
    )
  })

  it('is stored from the form when one is typed', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

    const wrapper = await render(NewRoutinePage)

    await wrapper.find('input[type="text"]').setValue('Morning')
    await wrapper
      .find('input[aria-label="The time of day this routine usually starts"]')
      .setValue('06:30')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect((await persistence.routines.all())[0]).toMatchObject({ anchorTime: 6 * 60 + 30 })
  })

  it('stores none at all when the field is left alone', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habitNamed('Stretch')] })

    const wrapper = await render(NewRoutinePage)

    await wrapper.find('input[type="text"]').setValue('Morning')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect((await persistence.routines.all())[0]).not.toHaveProperty('anchorTime')
  })
})

/** Chooses an action from the sheet by its label, which is what a finger has to aim at. */
async function pick(wrapper: ReturnType<typeof mount>, label: string) {
  const action = wrapper
    .findAll('dialog[open] button')
    .find((button) => button.text().startsWith(label))

  if (!action) throw new Error(`No action labelled ${label}.`)

  await action.trigger('click')

  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe('handing one to somebody else', () => {
  it('writes out the names, the lengths and the hour, and nothing else', async () => {
    const stretch = habitNamed('Stretch')
    const routine = createRoutine({
      id: newIdentifier(),
      name: 'Morning',
      habitIds: [stretch.id],
      createdOn: CREATED_ON,
      anchorTime: timeOfDay(7 * 60),
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [stretch], routines: [routine] })

    const wrapper = await render(RoutinesPage)

    await wrapper.get('[aria-label="Actions for Morning"]').trigger('click')
    await pick(wrapper, 'Share')

    const [written] = platform.saved

    expect(written?.name).toBe('some-kaizen-routine-morning.json')

    // The trust model is what is *absent*. A shared routine carries no identifiers and no
    // dates, so there is nothing in it that could name, replace or revive anything on the
    // device it lands on — which is why the reading side has nothing to sanitise.
    expect(written?.contents).toContain('Stretch')
    expect(written?.contents).not.toContain(stretch.id)
    expect(written?.contents).not.toContain(routine.id)
    expect(written?.contents).not.toContain(CREATED_ON)
  })
})
