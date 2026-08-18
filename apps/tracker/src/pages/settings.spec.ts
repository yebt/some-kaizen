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
import { newIdentifier } from '@shared/domain/identifier'
import { createCompletedHabit, frequency } from '@modules/habits/domain/habit'
import { recordCompleted } from '@modules/habits/domain/habit-entry'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { type Dataset, EMPTY_DATASET } from '@modules/data/domain/dataset'
import { serializeDataset } from '@modules/data/domain/data-transfer'

import SettingsPage from './settings.vue'

const CREATED_ON = calendarDate('2020-01-01')
const DAY = calendarDate('2026-03-11')

let persistence: Persistence
let databaseCounter = 0
let offered: string | null

beforeEach(async () => {
  databaseCounter += 1
  offered = null
  persistence = await createPersistence(`settings-spec-${databaseCounter}`)
})

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await flushPromises()
}

/** A file exchange that hands back whatever the test decided the chosen file contains. */
function stubPlatform(): PlatformServices {
  return {
    files: { save: async () => undefined, pick: async () => offered },
    reminders: { ensurePermission: async () => 'unsupported', sync: async () => undefined },
  }
}

async function renderSettings() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', component: SettingsPage },
      { path: '/block-time', component: { template: '<div />' } },
    ],
  })

  await router.push('/settings')
  await router.isReady()

  const wrapper = mount(SettingsPage, {
    global: {
      plugins: [createPinia(), PiniaColada, router],
      provide: {
        [PERSISTENCE_KEY as symbol]: persistence,
        [PLATFORM_KEY as symbol]: stubPlatform(),
      },
    },
  })

  await flushPromises()

  return wrapper
}

function habitNamed(name: string) {
  return createCompletedHabit({
    id: newIdentifier(),
    name,
    frequency: frequency('daily', 1),
    createdOn: CREATED_ON,
  })
}

function fileWith(parts: Partial<Dataset>): string {
  return serializeDataset({ ...EMPTY_DATASET, ...parts }, new Date('2026-03-11T10:00:00.000Z'))
}

async function chooseImport(wrapper: Awaited<ReturnType<typeof renderSettings>>) {
  await wrapper
    .findAll('button')
    .find((node) => node.text() === 'Import')
    ?.trigger('click')
  await settle()
}

async function confirmMerge(wrapper: Awaited<ReturnType<typeof renderSettings>>) {
  await wrapper
    .findAll('dialog button')
    .find((node) => node.text() === 'Merge')
    ?.trigger('click')
  await settle()
}

describe('importing a backup', () => {
  it('keeps what is already here and adds what the file brings', async () => {
    // The point of the change: a backup is usually the other half of your data.
    const mine = habitNamed('Meditate')

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [mine] })
    offered = fileWith({ habits: [habitNamed('Run')] })

    const wrapper = await renderSettings()

    await chooseImport(wrapper)
    await confirmMerge(wrapper)

    const stored = await persistence.habits.all()

    expect(stored.map((habit) => habit.name).sort()).toEqual(['Meditate', 'Run'])
  })

  it('shows what would change before writing anything', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)
    offered = fileWith({ habits: [habitNamed('Run')] })

    const wrapper = await renderSettings()

    await chooseImport(wrapper)

    expect(wrapper.find('dialog').attributes('open')).toBeDefined()
    expect(wrapper.find('dialog').text()).toContain('Merge this file?')
    // Still untouched: the preview is shown before the write, not after.
    expect(await persistence.habits.all()).toEqual([])
  })

  it('writes nothing when the preview is dismissed', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)
    offered = fileWith({ habits: [habitNamed('Run')] })

    const wrapper = await renderSettings()

    await chooseImport(wrapper)
    await wrapper
      .findAll('dialog button')
      .find((node) => node.text() === 'Cancel')
      ?.trigger('click')
    await settle()

    expect(await persistence.habits.all()).toEqual([])
  })

  it('reports a habit the file disagrees about and keeps the local one', async () => {
    const mine = habitNamed('Meditate')

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [mine] })
    offered = fileWith({ habits: [{ ...mine, name: 'Meditation' }] })

    const wrapper = await renderSettings()

    await chooseImport(wrapper)

    expect(wrapper.find('dialog').text()).toContain('collision')

    await confirmMerge(wrapper)

    expect((await persistence.habits.all())[0]?.name).toBe('Meditate')
  })

  it('takes the more recent answer for a day already recorded', async () => {
    const habit = habitNamed('Meditate')
    const id = newIdentifier()

    await replaceDataset(persistence, {
      ...EMPTY_DATASET,
      habits: [habit],
      entries: [recordCompleted(id, habit, DAY, false, { recordedAt: 100 })],
    })
    offered = fileWith({
      habits: [habit],
      entries: [recordCompleted(id, habit, DAY, true, { recordedAt: 200 })],
    })

    const wrapper = await renderSettings()

    await chooseImport(wrapper)
    await confirmMerge(wrapper)

    expect((await persistence.entries.all())[0]?.outcome).toBe('done')
  })

  it('says so when the file adds nothing', async () => {
    const mine = habitNamed('Meditate')

    await replaceDataset(persistence, { ...EMPTY_DATASET, habits: [mine] })
    offered = fileWith({ habits: [mine] })

    const wrapper = await renderSettings()

    await chooseImport(wrapper)

    expect(wrapper.find('dialog').text()).toContain('already here')
  })

  it('refuses a file that is not a backup without opening the preview', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)
    offered = '{"format":"something-else"}'

    const wrapper = await renderSettings()

    await chooseImport(wrapper)

    // The element and its content are always in the tree, so only the open state can tell
    // a refused file from an accepted one.
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
  })
})

describe('the destructive actions', () => {
  it('are folded away until asked for', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderSettings()

    expect(wrapper.text()).not.toContain('Clear everything')
    expect(wrapper.text()).toContain('Show the destructive actions')
  })

  it('appear on a deliberate tap', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await renderSettings()

    await wrapper
      .findAll('button')
      .find((node) => node.text().includes('Show the destructive actions'))
      ?.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Clear everything')
  })
})
