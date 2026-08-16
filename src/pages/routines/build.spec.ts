import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { calendarDate, todayIn } from '@shared/domain/calendar-date'
import { type Identifier, newIdentifier } from '@shared/domain/identifier'
import { timeOfDay } from '@shared/domain/time-of-day'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { createRoutine } from '@modules/habits/domain/routine'
import { impliedOccurrenceId } from '@modules/planning/domain/day-agenda'
import { planInstance, scheduleAt } from '@modules/planning/domain/planned-instance'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import BuildPage from './build/[id].vue'

const CREATED_ON = calendarDate('2020-01-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  globalThis.localStorage?.clear()
  persistence = await createPersistence(`build-spec-${databaseCounter}`)
})

function habitNamed(name: string, usualDurationMinutes?: number) {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
    ...(usualDurationMinutes === undefined ? {} : { usualDurationMinutes }),
  })
}

function routineOf(habitIds: Identifier[], anchorTime?: number) {
  return createRoutine({
    id: newIdentifier(),
    name: 'Morning',
    habitIds,
    createdOn: CREATED_ON,
    ...(anchorTime === undefined ? {} : { anchorTime: timeOfDay(anchorTime) }),
  })
}

async function render(routineId: Identifier) {
  const instance = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/routines', component: BuildPage },
      { path: '/routines/build/:id', component: BuildPage },
      { path: '/day/:date', component: BuildPage },
    ],
  })

  await instance.push(`/routines/build/${routineId}`)
  await instance.isReady()

  const wrapper = mount(BuildPage, {
    global: {
      plugins: [createPinia(), PiniaColada, instance],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

/** Lets a mutation, its invalidation and the refetch behind it all finish. */
async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await flushPromises()
}

function startField(wrapper: Awaited<ReturnType<typeof render>>) {
  return wrapper.find('[aria-label="The time this routine starts"]')
}

function lengthField(wrapper: Awaited<ReturnType<typeof render>>, name: string) {
  return wrapper.find(`[aria-label="How long ${name} takes, in minutes"]`)
}

describe('the routine builder', () => {
  it('starts the sequence at the hour the routine already says it does', async () => {
    // The anchor was described from the start as the thing a builder would count forward
    // from. Making someone retype it here would be asking a question already answered.
    const stretch = habitNamed('Stretch')
    const routine = routineOf([stretch.id], 6 * 60 + 30)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routine],
    })

    expect((await render(routine.id)).find('input[type="time"]').element).toHaveProperty(
      'value',
      '06:30',
    )
  })

  it('shows each step at the time the one before it finishes', async () => {
    const stretch = habitNamed('Stretch', 10)
    const read = habitNamed('Read', 20)
    const routine = routineOf([stretch.id, read.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch, read],
      routines: [routine],
    })

    const text = (await render(routine.id)).text()

    expect(text).toContain('06:00')
    expect(text).toContain('06:10')
  })

  it('moves everything after a step when that step gets longer', async () => {
    // The whole reason to fill a day this way: you see the cost of a longer step before you
    // commit to it, rather than discovering it card by card.
    const stretch = habitNamed('Stretch', 10)
    const read = habitNamed('Read', 20)
    const routine = routineOf([stretch.id, read.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch, read],
      routines: [routine],
    })

    const wrapper = await render(routine.id)

    await lengthField(wrapper, 'Stretch').setValue('25')

    expect(wrapper.text()).toContain('06:25')
  })

  it('moves everything when the start moves', async () => {
    const stretch = habitNamed('Stretch', 10)
    const routine = routineOf([stretch.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routine],
    })

    const wrapper = await render(routine.id)

    await startField(wrapper).setValue('07:15')

    expect(wrapper.text()).toContain('07:15')
  })

  it('says where the whole routine finishes, which is the number people check', async () => {
    const stretch = habitNamed('Stretch', 10)
    const read = habitNamed('Read', 20)
    const routine = routineOf([stretch.id, read.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch, read],
      routines: [routine],
    })

    expect((await render(routine.id)).text()).toContain('06:30')
  })

  it('writes an occurrence for every step when built', async () => {
    const stretch = habitNamed('Stretch', 10)
    const read = habitNamed('Read', 20)
    const routine = routineOf([stretch.id, read.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch, read],
      routines: [routine],
    })

    const wrapper = await render(routine.id)

    await wrapper.find('form').trigger('submit')
    await settle()

    const stored = await persistence.instances.all()

    expect(stored).toHaveLength(2)
    expect(stored.find((one) => one.habitId === read.id)).toMatchObject({
      startsAt: 6 * 60 + 10,
      durationMinutes: 20,
      date: todayIn(),
    })
  })

  it('remembers each length on its habit, so the next build is already filled in', async () => {
    // Without this the screen is a one-off. The length is a fact about the habit — stretching
    // takes ten minutes whenever you do it — so it belongs on the habit, not on one day.
    const stretch = habitNamed('Stretch')
    const routine = routineOf([stretch.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routine],
    })

    const wrapper = await render(routine.id)

    await lengthField(wrapper, 'Stretch').setValue('12')
    await wrapper.find('form').trigger('submit')
    await settle()

    expect((await persistence.habits.all())[0]).toMatchObject({ usualDurationMinutes: 12 })
  })

  it('replaces a card the habit already had that day rather than adding a second', async () => {
    const stretch = habitNamed('Stretch', 10)
    const routine = routineOf([stretch.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routine],
      instances: [
        scheduleAt(
          planInstance({
            id: newIdentifier(),
            habitId: stretch.id,
            date: todayIn(),
            period: 'daily',
          }),
          timeOfDay(19 * 60),
        ),
      ],
    })

    const wrapper = await render(routine.id)

    await wrapper.find('form').trigger('submit')
    await settle()

    const stored = await persistence.instances.all()

    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ startsAt: 6 * 60 })
  })

  it('gives each occurrence the identity the day derives, so nothing is counted twice', async () => {
    const stretch = habitNamed('Stretch', 10)
    const routine = routineOf([stretch.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routine],
    })

    const wrapper = await render(routine.id)

    await wrapper.find('form').trigger('submit')
    await settle()

    expect((await persistence.instances.all())[0]?.id).toBe(
      impliedOccurrenceId(stretch.id, todayIn(), 0),
    )
  })

  it('names the steps that run past midnight instead of placing them wrongly', async () => {
    const windDown = habitNamed('Wind down', 20)
    const sleep = habitNamed('Sleep', 20)
    const routine = routineOf([windDown.id, sleep.id], 23 * 60 + 50)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [windDown, sleep],
      routines: [routine],
    })

    const wrapper = await render(routine.id)
    const warning = wrapper.find('[role="alert"]')

    expect(warning.text()).toContain('past midnight')
    expect(warning.text()).toContain('Sleep')
  })

  it('writes nothing for a step it warned would not fit', async () => {
    const windDown = habitNamed('Wind down', 20)
    const sleep = habitNamed('Sleep', 20)
    const routine = routineOf([windDown.id, sleep.id], 23 * 60 + 50)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [windDown, sleep],
      routines: [routine],
    })

    const wrapper = await render(routine.id)

    await wrapper.find('form').trigger('submit')
    await settle()

    const stored = await persistence.instances.all()

    expect(stored).toHaveLength(1)
    expect(stored[0]?.habitId).toBe(windDown.id)
  })

  it('offers the default length for a habit that has never been timed', async () => {
    const stretch = habitNamed('Stretch')
    const routine = routineOf([stretch.id], 6 * 60)

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [stretch],
      routines: [routine],
    })

    expect(lengthField(await render(routine.id), 'Stretch').element).toHaveProperty('value', '30')
  })

  it('has nothing to build when the routine is empty, and says so', async () => {
    const routine = routineOf([])

    await replaceDataset(persistence, { ...EMPTY_DATASET, routines: [routine] })

    const wrapper = await render(routine.id)

    expect(wrapper.text()).toContain('Nothing to build')
    expect(wrapper.find('button[type="submit"]').attributes('disabled')).toBeDefined()
  })

  it('says plainly when the routine is gone rather than rendering an empty form', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render(newIdentifier())).text()).toContain('no longer exists')
  })
})
