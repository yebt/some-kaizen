import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import TodayPage from './index.vue'

/**
 * A rendering smoke test.
 *
 * A green type check and a green bundle both pass happily on a screen that throws the
 * moment it is mounted, so the home screen is actually built here and read back.
 */
describe('Today page', () => {
  it('renders without throwing', () => {
    const wrapper = mount(TodayPage)

    expect(wrapper.find('h1').text()).toBe('Today')
  })

  it('shows the schedule built from block time and scheduled habits', () => {
    const wrapper = mount(TodayPage)
    const text = wrapper.text()

    expect(text).toContain('Schedule')
    expect(text).toContain('Work')
    expect(text).toContain('Sleep')
  })

  it('places the day’s scheduled habits alongside the fixed blocks', () => {
    const wrapper = mount(TodayPage)

    expect(wrapper.text()).toContain('Meditate')
  })

  it('lists an occurrence with no time under anytime today', () => {
    const wrapper = mount(TodayPage)

    expect(wrapper.text()).toContain('Anytime today')
    expect(wrapper.text()).toContain('Drink water')
  })

  it('asks about the most recent unanswered negative habit', () => {
    const wrapper = mount(TodayPage)

    expect(wrapper.text()).toContain('Did you avoid it?')
    expect(wrapper.text()).toContain('Smoking')
  })

  it('orders the schedule chronologically', () => {
    const wrapper = mount(TodayPage)
    const times = wrapper
      .findAll('ol li span:first-child')
      .map((node) => node.text())
      .filter((value) => /^\d{2}:\d{2}$/.test(value))

    expect(times).toEqual([...times].sort())
  })
})
