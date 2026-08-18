import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { LONG_PRESS_MS } from './drag/use-drag-and-drop'

import TabBar from './TabBar.vue'

const NOWHERE = { template: '<p>Nowhere</p>' }

async function renderBar() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: NOWHERE },
      { path: '/habits', component: NOWHERE },
      { path: '/plan', component: NOWHERE },
      { path: '/settings', component: NOWHERE },
      { path: '/habits/new', component: NOWHERE },
      { path: '/routines/new', component: NOWHERE },
      { path: '/block-time/new', component: NOWHERE },
      { path: '/challenges', component: NOWHERE },
    ],
  })

  await router.push('/')
  await router.isReady()

  const wrapper = mount(TabBar, { global: { plugins: [router] } })

  await flushPromises()

  return { wrapper, router }
}

function plus(wrapper: Awaited<ReturnType<typeof renderBar>>['wrapper']) {
  return wrapper.get('[aria-label="Add habit"]')
}

/**
 * Dispatched rather than triggered, because `clientX` on a `MouseEvent` has only a getter and
 * the test utility assigns to it. The gesture reads coordinates, so an event without them
 * would prove nothing about a finger that wanders.
 */
function pointerAt(type: string, x: number, y: number) {
  return new MouseEvent(type, { clientX: x, clientY: y, bubbles: true })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

async function hold(wrapper: Awaited<ReturnType<typeof renderBar>>['wrapper']) {
  plus(wrapper).element.dispatchEvent(pointerAt('pointerdown', 0, 0))
  vi.advanceTimersByTime(LONG_PRESS_MS)
  await flushPromises()
}

describe('the button in the middle', () => {
  it('adds a habit on a plain tap, which is what it says it does', async () => {
    const { wrapper, router } = await renderBar()

    await plus(wrapper).trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/habits/new')
  })

  /**
   * Held, it offers everything the app can be given.
   *
   * A habit is not the only thing you can add, and standing on the blocks screen pressing a
   * plus that adds a habit is the control lying about what it is for. It stays a habit on a
   * tap because that is the common one, and the rest live one press deeper rather than
   * behind a screen you have to already know about.
   */
  it('offers every kind of thing when it is held', async () => {
    const { wrapper } = await renderBar()

    // A native dialog is in the document whether or not it is showing, so the open attribute
    // is the assertion. Read as mere existence, every one of these would pass shut.
    expect(wrapper.find('dialog[open]').exists()).toBe(false)

    await hold(wrapper)

    const sheet = wrapper.get('dialog[open]')

    expect(sheet.text()).toContain('Habit')
    expect(sheet.text()).toContain('Routine')
    expect(sheet.text()).toContain('Block')
    expect(sheet.text()).toContain('Challenge')
  })

  it('does not also add a habit on the way, which would open a form behind the sheet', async () => {
    const { wrapper, router } = await renderBar()

    await hold(wrapper)
    plus(wrapper).element.dispatchEvent(pointerAt('pointerup', 0, 0))
    await plus(wrapper).trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/')
  })

  it('goes where the choice says', async () => {
    const { wrapper, router } = await renderBar()

    await hold(wrapper)
    await wrapper
      .findAll('dialog[open] button')
      .find((node) => node.text().includes('Block'))
      ?.trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/block-time/new')
  })

  it('a finger that wanders is scrolling, and opens nothing', async () => {
    const { wrapper } = await renderBar()

    plus(wrapper).element.dispatchEvent(pointerAt('pointerdown', 0, 0))
    plus(wrapper).element.dispatchEvent(pointerAt('pointermove', 0, 40))
    vi.advanceTimersByTime(LONG_PRESS_MS)
    await flushPromises()

    expect(wrapper.find('dialog[open]').exists()).toBe(false)
  })
})
