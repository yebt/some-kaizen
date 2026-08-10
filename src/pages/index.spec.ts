import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'
import { buildPreviewDataset } from '@shared/dev/preview-dataset'

import TodayPage from './index.vue'

/**
 * An integration test over the real IndexedDB adapter rather than a stubbed store.
 *
 * The screen's whole job is turning stored records into a readable day, so faking the
 * storage would test the half that cannot break.
 */
let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`today-spec-${databaseCounter}`)
})

async function renderToday() {
  const wrapper = mount(TodayPage, {
    global: {
      plugins: [createPinia(), PiniaColada],
      provide: { [PERSISTENCE_KEY as symbol]: persistence },
    },
  })

  await flushPromises()

  return wrapper
}

describe('with a populated day', () => {
  beforeEach(async () => {
    await replaceDataset(persistence, buildPreviewDataset())
  })

  it('renders without throwing', async () => {
    const wrapper = await renderToday()

    expect(wrapper.find('h1').text()).toBe('Today')
  })

  it('shows block time and scheduled habits in one schedule', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('Schedule')
    expect(text).toContain('Work')
    expect(text).toContain('Sleep')
    expect(text).toContain('Meditate')
  })

  it('lists an occurrence with no time under anytime today', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('Anytime today')
    expect(text).toContain('Drink water')
  })

  it('asks about the most recent unanswered negative habit', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('Did you avoid it?')
    expect(text).toContain('Smoking')
  })

  it('orders the schedule chronologically', async () => {
    const times = (await renderToday())
      .findAll('ol li span:first-child')
      .map((node) => node.text())
      .filter((value) => /^\d{2}:\d{2}$/.test(value))

    expect(times).toEqual([...times].sort())
  })
})

describe('with nothing stored', () => {
  beforeEach(async () => {
    await replaceDataset(persistence, EMPTY_DATASET)
  })

  it('invites the user to add a habit rather than showing an empty schedule', async () => {
    const text = (await renderToday()).text()

    expect(text).toContain('No habits yet')
    expect(text).not.toContain('Anytime today')
  })
})
