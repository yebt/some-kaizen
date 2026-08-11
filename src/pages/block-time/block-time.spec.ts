import 'fake-indexeddb/auto'

import { PiniaColada } from '@pinia/colada'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { createPersistence, type Persistence } from '@core/persistence'
import { PERSISTENCE_KEY } from '@core/persistence-context'
import { calendarDate } from '@shared/domain/calendar-date'
import { newIdentifier } from '@shared/domain/identifier'
import { interval, timeOfDay } from '@shared/domain/time-of-day'
import { createBlockTime } from '@modules/block-time/domain/block-time'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import BlockTimePage from './index.vue'
import NewBlockPage from './new.vue'

const CREATED_ON = calendarDate('2020-01-01')

let persistence: Persistence
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  persistence = await createPersistence(`block-time-spec-${databaseCounter}`)
})

async function settle() {
  for (let round = 0; round < 3; round += 1) {
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  await flushPromises()
}

async function render(component: typeof BlockTimePage | typeof NewBlockPage) {
  const instance = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/block-time', component: BlockTimePage },
      { path: '/block-time/new', component: NewBlockPage },
    ],
  })

  await instance.push('/block-time')
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

function workBlock() {
  return createBlockTime({
    id: newIdentifier(),
    name: 'Work',
    span: interval(timeOfDay(9 * 60), 8 * 60),
    weekdays: [1, 2, 3, 4, 5],
    createdOn: CREATED_ON,
  })
}

describe('the block list', () => {
  it('explains why blocks matter when there are none', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await render(BlockTimePage)).text()).toContain('No blocks yet')
  })

  it('shows the span as two clock times', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    expect((await render(BlockTimePage)).text()).toContain('09:00 – 17:00')
  })

  it('reads a block crossing midnight forwards rather than backwards', async () => {
    const sleep = createBlockTime({
      id: newIdentifier(),
      name: 'Sleep',
      span: interval(timeOfDay(23 * 60), 8 * 60),
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [sleep] })

    expect((await render(BlockTimePage)).text()).toContain('23:00 – 07:00')
  })

  it('names the days a block covers', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    expect((await render(BlockTimePage)).text()).toContain('Mon Tue Wed Thu Fri')
  })

  it('says every day rather than listing all seven', async () => {
    const sleep = createBlockTime({
      id: newIdentifier(),
      name: 'Sleep',
      span: interval(timeOfDay(23 * 60), 8 * 60),
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [sleep] })

    expect((await render(BlockTimePage)).text()).toContain('Every day')
  })

  it('totals the hours the week already owes', async () => {
    // Eight hours across five weekdays.
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    expect((await render(BlockTimePage)).text()).toContain('40 hours a week')
  })
})

describe('creating a block', () => {
  it('stores it with the span and days given', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewBlockPage)

    await wrapper.find('#block-name').setValue('Work')
    await wrapper.find('form').trigger('submit')
    await settle()

    const [stored] = await persistence.blocks.all()

    expect(stored).toMatchObject({
      name: 'Work',
      span: { start: 540, durationMinutes: 480 },
      weekdays: [1, 2, 3, 4, 5],
    })
  })

  it('reads an end earlier than the start as the next morning', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewBlockPage)

    await wrapper.find('#block-name').setValue('Sleep')
    await wrapper.findAll('input[type="time"]')[0]?.setValue('23:00')
    await wrapper.findAll('input[type="time"]')[1]?.setValue('07:00')
    await wrapper.find('form').trigger('submit')
    await settle()

    const [stored] = await persistence.blocks.all()

    expect(stored?.span).toEqual({ start: 1380, durationMinutes: 480 })
  })

  it('refuses a block that would overlap an existing one', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    const wrapper = await render(NewBlockPage)

    await wrapper.find('#block-name').setValue('Meeting')
    await wrapper.findAll('input[type="time"]')[0]?.setValue('10:00')
    await wrapper.findAll('input[type="time"]')[1]?.setValue('11:00')
    await wrapper.find('form').trigger('submit')
    await settle()

    expect(wrapper.find('[role="alert"]').text()).toContain('Work')
    expect(await persistence.blocks.all()).toHaveLength(1)
  })

  it('allows a block that only touches an existing one', async () => {
    // 17:00 starts exactly where work ends, which is a legal back to back day.
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    const wrapper = await render(NewBlockPage)

    await wrapper.find('#block-name').setValue('Commute')
    await wrapper.findAll('input[type="time"]')[0]?.setValue('17:00')
    await wrapper.findAll('input[type="time"]')[1]?.setValue('18:00')
    await wrapper.find('form').trigger('submit')
    await settle()

    expect(await persistence.blocks.all()).toHaveLength(2)
  })

  it('allows the same hours on days the existing block does not cover', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    const wrapper = await render(NewBlockPage)

    await wrapper.find('#block-name').setValue('Weekend job')
    // Drop the weekdays, keep only Saturday and Sunday.
    for (const day of [1, 2, 3, 4, 5]) {
      await wrapper.find(`[aria-label="Day ${day}"]`).trigger('click')
    }
    await wrapper.find('[aria-label="Day 6"]').trigger('click')
    await wrapper.find('[aria-label="Day 7"]').trigger('click')
    await wrapper.find('form').trigger('submit')
    await settle()

    expect(await persistence.blocks.all()).toHaveLength(2)
  })

  it('refuses a block covering no day at all', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    const wrapper = await render(NewBlockPage)

    await wrapper.find('#block-name').setValue('Nowhere')
    for (const day of [1, 2, 3, 4, 5]) {
      await wrapper.find(`[aria-label="Day ${day}"]`).trigger('click')
    }
    await wrapper.find('form').trigger('submit')
    await settle()

    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    expect(await persistence.blocks.all()).toEqual([])
  })
})
