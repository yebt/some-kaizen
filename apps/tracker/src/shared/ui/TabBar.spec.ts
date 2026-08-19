import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import TabBar from './TabBar.vue'

const NOWHERE = { template: '<p>Nowhere</p>' }

const DESTINATIONS = ['/', '/habits', '/plan', '/settings']

async function renderBar(at = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...DESTINATIONS.map((path) => ({ path, component: NOWHERE })),
      { path: '/habits/new', component: NOWHERE },
      { path: '/block-time', component: NOWHERE },
    ],
  })

  await router.push(at)
  await router.isReady()

  const wrapper = mount(TabBar, { global: { plugins: [router] } })

  await flushPromises()

  return { wrapper, router }
}

describe('the bar along the bottom', () => {
  it('is four places to go, and nothing else', async () => {
    /*
     * There used to be a fifth control in the middle that added a habit, from every screen.
     * It was the loudest thing in the app and it was wrong on most of them: standing on the
     * blocks screen, the obvious reading of a plus at the bottom is "add a block".
     *
     * A control fixed to every screen cannot quietly mean a different thing on each one, and
     * a menu hidden behind a long press only helps somebody who already knows it is there.
     * So it is gone, and creating something lives on the screen that holds that kind of
     * thing, where the button can say which kind it makes.
     */
    const { wrapper } = await renderBar()

    const links = wrapper.findAll('a')

    expect(links).toHaveLength(4)
    expect(links.map((link) => link.attributes('href'))).toEqual(DESTINATIONS)
  })

  it('offers no way to create anything', async () => {
    const { wrapper } = await renderBar('/block-time')

    expect(wrapper.findAll('button')).toEqual([])
    expect(wrapper.text()).not.toMatch(/add/i)
  })

  it('names every destination, since each is drawn as an icon alone', async () => {
    const { wrapper } = await renderBar()

    expect(wrapper.findAll('a').map((link) => link.attributes('aria-label'))).toEqual([
      'Today',
      'Habits',
      'Plan',
      'Settings',
    ])
  })

  it('marks the one you are on', async () => {
    const { wrapper } = await renderBar('/plan')

    const current = wrapper.findAll('a').filter((link) => link.classes().includes('bg-accent'))

    expect(current).toHaveLength(1)
    expect(current[0]!.attributes('aria-label')).toBe('Plan')
  })
})
