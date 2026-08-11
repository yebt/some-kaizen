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
import {
  createCompletedHabit,
  createMeasuredHabit,
  createNegativeHabit,
  frequency,
  isMeasured,
  measure,
} from '@modules/habits/domain/habit'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import HabitsPage from './index.vue'
import NewHabitPage from './new.vue'

const CREATED_ON = calendarDate('2020-01-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`habits-spec-${databaseCounter}`)
})

function router() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/habits', component: HabitsPage },
      { path: '/habits/new', component: NewHabitPage },
    ],
  })
}

async function render(component: typeof HabitsPage | typeof NewHabitPage) {
  const instance = router()

  await instance.push('/habits')
  await instance.isReady()

  const wrapper = mount(component, {
    global: {
      plugins: [createPinia(), PiniaColada, instance],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

describe('the habit list', () => {
  it('invites a first habit when there are none', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render(HabitsPage)).text()).toContain('Nothing here yet')
  })

  it('describes how often a positive habit recurs', async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [
        createCompletedHabit({
          id: newIdentifier(),
          name: 'Run',
          frequency: frequency('weekly', 2),
          createdOn: CREATED_ON,
        }),
      ],
    })

    expect((await render(HabitsPage)).text()).toContain('2 times a week')
  })

  it('describes a measured habit with its thresholds', async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [
        createMeasuredHabit({
          id: newIdentifier(),
          name: 'Drink water',
          frequency: frequency('daily', 1),
          measure: measure('litres', 1, 2),
          createdOn: CREATED_ON,
        }),
      ],
    })

    expect((await render(HabitsPage)).text()).toContain('1–2 litres')
  })

  it('says a negative habit is judged the next morning rather than showing a frequency', async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [
        createNegativeHabit({ id: newIdentifier(), name: 'Smoking', createdOn: CREATED_ON }),
      ],
    })

    expect((await render(HabitsPage)).text()).toContain('marked the next morning')
  })

  it('marks an archived habit as archived', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Run',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [{ ...habit, archivedOn: todayIn() }],
    })

    expect((await render(HabitsPage)).text()).toContain('archived')
  })
})

describe('creating a habit', () => {
  it('stores a completed habit with its frequency', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.find('#habit-name').setValue('Meditate')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [stored] = await persistence.habits.all()

    expect(stored).toMatchObject({ name: 'Meditate', polarity: 'positive', tracking: 'completed' })
  })

  it('stores a measured habit with its unit and thresholds', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.findAll('input[type="radio"]')[1]?.setValue()
    await wrapper.find('#habit-name').setValue('Drink water')
    await wrapper.find('input[aria-label="Unit"]').setValue('litres')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [stored] = await persistence.habits.all()

    expect(stored && isMeasured(stored) ? stored.measure.unit : undefined).toBe('litres')
  })

  it('stores a negative habit with no frequency at all', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.findAll('input[type="radio"]')[2]?.setValue()
    await wrapper.find('#habit-name').setValue('Smoking')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [stored] = await persistence.habits.all()

    expect(stored).toMatchObject({ polarity: 'negative' })
    expect(stored).not.toHaveProperty('frequency')
  })

  it('reports the domain’s own complaint instead of inventing its own rules', async () => {
    // The form does not revalidate: duplicating the model's rules would let the two drift.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.findAll('input[type="radio"]')[1]?.setValue()
    await wrapper.find('#habit-name').setValue('Drink water')
    await wrapper.find('input[aria-label="Unit"]').setValue('litres')
    // A goal below the minimum makes a partial day unreachable, so the model rejects it.
    await wrapper.findAll('input[type="number"]')[1]?.setValue(5)
    await wrapper.findAll('input[type="number"]')[2]?.setValue(1)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('goal')
    expect(await persistence.habits.all()).toEqual([])
  })

  it('refuses a blank name without storing anything', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.find('#habit-name').setValue('   ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(await persistence.habits.all()).toEqual([])
  })
})
