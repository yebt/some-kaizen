import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { calendarDate, startOfWeek, todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { createCompletedHabit, createNegativeHabit, frequency } from '@modules/habits/domain/habit'
import { planInstance } from '@modules/planning/domain/planned-instance'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import PlanPage from './plan.vue'

const CREATED_ON = calendarDate('2020-01-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`plan-spec-${databaseCounter}`)
})

async function renderPlan() {
  const wrapper = mount(PlanPage, {
    global: {
      plugins: [createPinia(), PiniaColada],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

function runTwiceAWeek() {
  return createCompletedHabit({
    id: newIdentifier(),
    name: 'Run',
    frequency: frequency('weekly', 2),
    createdOn: CREATED_ON,
  })
}

describe('the tray', () => {
  it('offers a habit that still owes occurrences this week', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [runTwiceAWeek()] })

    const text = (await renderPlan()).text()

    expect(text).toContain('To place')
    expect(text).toContain('Run')
  })

  it('counts down as occurrences are placed', async () => {
    const habit = runTwiceAWeek()
    const monday = startOfWeek(todayIn())

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      instances: [
        planInstance({ id: newIdentifier(), habitId: habit.id, date: monday, period: 'weekly' }),
      ],
    })

    // One of the two runs is placed, so exactly one is still owed.
    expect((await renderPlan()).text()).toMatch(/Run\s*1/)
  })

  it('says nothing is left once the week is satisfied', async () => {
    const habit = runTwiceAWeek()
    const monday = startOfWeek(todayIn())

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      instances: [
        planInstance({ id: newIdentifier(), habitId: habit.id, date: monday, period: 'weekly' }),
        planInstance({ id: newIdentifier(), habitId: habit.id, date: monday, period: 'weekly' }),
      ],
    })

    expect((await renderPlan()).text()).toContain('Nothing left to place')
  })

  it('never offers a negative habit, which is not something you schedule', async () => {
    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [
        createNegativeHabit({ id: newIdentifier(), name: 'Smoking', createdOn: CREATED_ON }),
      ],
    })

    expect((await renderPlan()).text()).not.toContain('Smoking')
  })
})

describe('the week board', () => {
  it('renders a drop zone for each day of the week', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const zones = (await renderPlan()).findAll('[data-drop-zone]')

    expect(zones).toHaveLength(7)
  })

  it('keys each zone by its calendar date', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const monday = startOfWeek(todayIn())
    const zones = (await renderPlan())
      .findAll('[data-drop-zone]')
      .map((node) => node.attributes('data-drop-zone'))

    expect(zones[0]).toBe(monday)
  })

  it('shows a placed occurrence on its day', async () => {
    const habit = runTwiceAWeek()
    const monday = startOfWeek(todayIn())

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      instances: [
        planInstance({ id: newIdentifier(), habitId: habit.id, date: monday, period: 'weekly' }),
      ],
    })

    const wrapper = await renderPlan()
    const mondayZone = wrapper.find(`[data-drop-zone="${monday}"]`)

    expect(mondayZone.text()).toContain('Run')
  })

  it('invites a drop on a day with nothing on it', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await renderPlan()).text()).toContain('Drop a habit here')
  })

  it('does not draw an occurrence whose habit no longer exists', async () => {
    // Orphans cannot be planned or moved, so drawing them would offer a card that does
    // nothing. They disappear from the board rather than rendering as "Habit".
    const monday = startOfWeek(todayIn())

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      instances: [
        planInstance({
          id: newIdentifier(),
          habitId: newIdentifier(),
          date: monday,
          period: 'weekly',
        }),
      ],
    })

    expect((await renderPlan()).find(`[data-drop-zone="${monday}"]`).text()).toContain(
      'Drop a habit here',
    )
  })
})
