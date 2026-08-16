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
import { PALETTE } from '@shared/domain/appearance'
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

import EditHabitPage from './[id]/edit.vue'
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
    // Chosen by name rather than by position: adding any number field to the form ahead of
    // these shifts the indices, and the test then sets two other fields and passes anyway.
    await wrapper.find('input[aria-label="Minimum"]').setValue(5)
    await wrapper.find('input[aria-label="Goal"]').setValue(1)
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[role="alert"]').text()).toContain('goal')
    expect(await persistence.habits.all()).toEqual([])
  })

  it('stores the hour a habit usually happens at', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.find('#habit-name').setValue('Meditate')
    await wrapper
      .find('input[aria-label="The time of day this habit usually happens"]')
      .setValue('07:00')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [stored] = await persistence.habits.all()

    expect(stored).toMatchObject({ usualTime: 7 * 60 })
  })

  it('stores how long a habit usually takes', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.find('#habit-name').setValue('Meditate')
    await wrapper
      .find('input[aria-label="How long this habit usually takes, in minutes"]')
      .setValue('20')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect((await persistence.habits.all())[0]).toMatchObject({ usualDurationMinutes: 20 })
  })

  it('stores no length at all when none is given', async () => {
    // The half hour a card defaults to is a drawing size, not a claim about how long
    // meditation takes. Storing it here would put a number on the habit nobody stated.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.find('#habit-name').setValue('Meditate')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect((await persistence.habits.all())[0]).not.toHaveProperty('usualDurationMinutes')
  })

  it('stores no usual hour at all when none is given', async () => {
    // Midnight is a real answer, so a defaulted zero would be a habit claiming an hour
    // nobody chose — and every card would stack at the top of the ruler.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.find('#habit-name').setValue('Meditate')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const [stored] = await persistence.habits.all()

    expect(stored).not.toHaveProperty('usualTime')
  })

  it('never asks a habit you are quitting when it usually happens', async () => {
    // You do not schedule the thing you are trying to stop doing.
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewHabitPage)

    await wrapper.findAll('input[type="radio"]')[2]?.setValue()

    expect(
      wrapper.find('input[aria-label="The time of day this habit usually happens"]').exists(),
    ).toBe(false)
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

describe('editing a habit', () => {
  async function renderEdit(habitId: string) {
    const instance = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/habits', component: HabitsPage },
        { path: '/habits/:id/edit', component: EditHabitPage },
      ],
    })

    await instance.push(`/habits/${habitId}/edit`)
    await instance.isReady()

    const wrapper = mount(EditHabitPage, {
      global: {
        plugins: [createPinia(), PiniaColada, instance],
        provide: { [PERSISTENCE_KEY as symbol]: persistence },
      },
    })

    await flushPromises()

    return wrapper
  }

  function running() {
    return createCompletedHabit({
      id: newIdentifier(),
      name: 'Run',
      frequency: frequency('weekly', 2),
      createdOn: CREATED_ON,
    })
  }

  it('prefills the form with what is stored', async () => {
    const habit = running()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderEdit(habit.id)

    expect((wrapper.find('#habit-name').element as HTMLInputElement).value).toBe('Run')
  })

  it('keeps the identity and the creation day, so the recorded history still belongs to it', async () => {
    const habit = running()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderEdit(habit.id)

    await wrapper.find('#habit-name').setValue('Jog')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    const stored = await persistence.habits.all()

    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ id: habit.id, name: 'Jog', createdOn: habit.createdOn })
  })

  it('stores a chosen colour and pattern', async () => {
    const habit = running()

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderEdit(habit.id)

    await wrapper.find(`[aria-label="Colour ${PALETTE[0]}"]`).trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((node) => node.text() === 'Dots')
      ?.trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect((await persistence.habits.all())[0]).toMatchObject({
      colour: PALETTE[0],
      pattern: 'dots',
    })
  })

  it('keeps an archived habit archived when it is edited', async () => {
    const habit = { ...running(), archivedOn: calendarDate('2026-05-05') }

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const wrapper = await renderEdit(habit.id)

    await wrapper.find('#habit-name').setValue('Jog')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect((await persistence.habits.all())[0]?.archivedOn).toBe('2026-05-05')
  })

  it('says so plainly when the habit is gone', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await renderEdit(newIdentifier())).text()).toContain('no longer exists')
  })
})

describe('the actions menu', () => {
  it('offers edit, archive and delete for a live habit', async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [
        createCompletedHabit({
          id: newIdentifier(),
          name: 'Run',
          frequency: frequency('daily', 1),
          createdOn: CREATED_ON,
        }),
      ],
    })

    const wrapper = await render(HabitsPage)

    await wrapper.find('[aria-label="Actions for Run"]').trigger('click')
    await flushPromises()

    const text = wrapper.find('dialog').text()

    expect(text).toContain('Edit')
    expect(text).toContain('Archive')
    expect(text).toContain('Delete')
  })

  it('does not offer to archive something already archived', async () => {
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

    const wrapper = await render(HabitsPage)

    await wrapper.find('[aria-label="Actions for Run"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('dialog').text()).not.toContain('Archive')
  })

  it('links to block time, which is the other half of a day', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(HabitsPage)

    expect(wrapper.find('a[href="/block-time"]').exists()).toBe(true)
  })
})
