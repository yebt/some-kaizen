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
import { PALETTE } from '@shared/domain/appearance'
import { usePreferences } from '@core/preferences-store'
import { createBlockTime } from '@modules/block-time/domain/block-time'
import { replaceDataset } from '@modules/data/application/dataset-queries'
import { EMPTY_DATASET } from '@modules/data/domain/dataset'

import EditBlockPage from './[id].vue'
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

/**
 * The value of a field, chosen by its accessible name.
 *
 * By name rather than by position: the two time fields are indistinguishable by selector
 * alone, and a test that reads "the first one" keeps passing while quietly reading a
 * different field the moment the form gains another.
 */
function inputValue(wrapper: ReturnType<typeof mount>, label: string): string {
  const node = wrapper.find(`input[aria-label="${label}"]`)

  if (!node.exists()) throw new Error(`No field labelled ${label}.`)

  return (node.element as HTMLInputElement).value
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
    await wrapper.find('input[aria-label="Starts at"]').setValue('23:00')
    await wrapper.find('input[aria-label="Ends at"]').setValue('07:00')
    await wrapper.find('form').trigger('submit')
    await settle()

    const [stored] = await persistence.blocks.all()

    expect(stored?.span).toEqual({ start: 1380, durationMinutes: 480 })
  })

  it('refuses a block that would overlap an existing one', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    const wrapper = await render(NewBlockPage)

    await wrapper.find('#block-name').setValue('Meeting')
    await wrapper.find('input[aria-label="Starts at"]').setValue('10:00')
    await wrapper.find('input[aria-label="Ends at"]').setValue('11:00')
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
    await wrapper.find('input[aria-label="Starts at"]').setValue('17:00')
    await wrapper.find('input[aria-label="Ends at"]').setValue('18:00')
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

describe('editing a block', () => {
  async function renderEdit(blockId: string) {
    const instance = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/block-time', component: BlockTimePage },
        { path: '/block-time/:id', component: EditBlockPage },
      ],
    })

    await instance.push(`/block-time/${blockId}`)
    await instance.isReady()

    const wrapper = mount(EditBlockPage, {
      global: {
        plugins: [createPinia(), PiniaColada, instance],
        provide: { [PERSISTENCE_KEY as symbol]: persistence },
      },
    })

    await flushPromises()

    return wrapper
  }

  it('prefills the span as two clock times', async () => {
    const block = workBlock()

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [block] })

    const wrapper = await renderEdit(block.id)

    expect(inputValue(wrapper, 'Starts at')).toBe('09:00')
    expect(inputValue(wrapper, 'Ends at')).toBe('17:00')
  })

  it('prefills a span crossing midnight without turning it backwards', async () => {
    const sleep = createBlockTime({
      id: newIdentifier(),
      name: 'Sleep',
      span: interval(timeOfDay(23 * 60), 8 * 60),
      weekdays: [1, 2, 3, 4, 5, 6, 7],
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [sleep] })

    const wrapper = await renderEdit(sleep.id)

    expect(inputValue(wrapper, 'Starts at')).toBe('23:00')
    expect(inputValue(wrapper, 'Ends at')).toBe('07:00')
  })

  it('saves an unchanged block without reporting it as clashing with itself', async () => {
    // The overlap check skips the block's own stored copy, which is exactly what keeps an
    // edit that does not move the block saveable.
    const block = workBlock()

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [block] })

    const wrapper = await renderEdit(block.id)

    await wrapper.find('#block-name').setValue('Office')
    await wrapper.find('form').trigger('submit')
    await settle()

    const stored = await persistence.blocks.all()

    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ id: block.id, name: 'Office' })
  })

  it('still refuses a move that would collide with another block', async () => {
    const work = workBlock()
    const gym = createBlockTime({
      id: newIdentifier(),
      name: 'Gym',
      span: interval(timeOfDay(18 * 60), 60),
      weekdays: [1, 2, 3, 4, 5],
      createdOn: CREATED_ON,
    })

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [work, gym] })

    const wrapper = await renderEdit(gym.id)

    await wrapper.find('input[aria-label="Starts at"]').setValue('10:00')
    await wrapper.find('input[aria-label="Ends at"]').setValue('11:00')
    await wrapper.find('form').trigger('submit')
    await settle()

    expect(wrapper.find('[role="alert"]').text()).toContain('Work')
  })

  it('stores a chosen colour and pattern', async () => {
    const block = workBlock()

    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [block] })

    const wrapper = await renderEdit(block.id)

    await wrapper.find(`[aria-label="Colour ${PALETTE[1]}"]`).trigger('click')
    await flushPromises()
    await wrapper
      .findAll('button')
      .find((node) => node.text() === 'Stripes')
      ?.trigger('click')
    await wrapper.find('form').trigger('submit')
    await settle()

    expect((await persistence.blocks.all())[0]).toMatchObject({
      colour: PALETTE[1],
      pattern: 'stripes',
    })
  })

  it('says so plainly when the block is gone', async () => {
    await replaceDataset(persistence, EMPTY_DATASET)

    expect((await renderEdit(newIdentifier())).text()).toContain('no longer exists')
  })
})

describe('the clock preference', () => {
  it('writes spans on a 24 hour clock by default', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    expect((await render(BlockTimePage)).text()).toContain('09:00 – 17:00')
  })

  it('writes them on a 12 hour clock once that is chosen', async () => {
    await replaceDataset(persistence, { ...EMPTY_DATASET, blocks: [workBlock()] })

    const instance = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/block-time', component: BlockTimePage }],
    })

    await instance.push('/block-time')
    await instance.isReady()

    const pinia = createPinia()
    const wrapper = mount(BlockTimePage, {
      global: {
        plugins: [pinia, PiniaColada, instance],
        provide: { [PERSISTENCE_KEY as symbol]: persistence },
      },
    })

    usePreferences(pinia).setClock('12h')
    await flushPromises()

    expect(wrapper.text()).toContain('9:00 AM – 5:00 PM')
  })
})
