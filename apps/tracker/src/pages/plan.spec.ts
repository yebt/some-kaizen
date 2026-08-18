import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { calendarDate, startOfWeek, todayIn } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import {
  createCompletedHabit,
  createNegativeHabit,
  frequency,
  onWeekdays,
} from '@modules/habits/domain/habit'
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

    expect(text).toContain('Waiting for a day')
    expect(text).toContain('Run')
  })

  it('never offers a daily habit, whose day was never in question', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Stretch',
      frequency: frequency('daily', 1),
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    const text = (await renderPlan()).text()

    expect(text).not.toContain('Stretch')
    expect(text).toContain('Nothing needs a day chosen')
  })

  it('never offers a habit that already named its weekdays', async () => {
    const habit = createCompletedHabit({
      id: newIdentifier(),
      name: 'Swim',
      frequency: onWeekdays([1, 3, 5]),
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [habit] })

    expect((await renderPlan()).text()).not.toContain('Swim')
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

    // Distinct from the tray being empty because nothing on this device works this way:
    // one says "you have finished", the other says "this screen is not about your habits".
    const text = (await renderPlan()).text()

    expect(text).toContain('Nothing left to decide this week')
    expect(text).not.toContain('Nothing needs a day chosen')
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

  it('invites a drop on an empty day while something is waiting for one', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [runTwiceAWeek()] })

    expect((await renderPlan()).text()).toContain('Drop a habit here')
  })

  it('stops inviting a drop once there is nothing to drop', async () => {
    // Seven rows asking for something the tray cannot give is an instruction that fails.
    await replaceDataset(persistence, EMPTY_DATASET)

    const text = (await renderPlan()).text()

    expect(text).not.toContain('Drop a habit here')
    expect(text).toContain('Nothing on this day')
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
      'Nothing on this day',
    )
  })
})
