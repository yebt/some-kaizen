import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { TOAST_DURATION_MS, useFeedback } from './feedback-store'

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('confirm', () => {
  it('exposes the question while it waits for an answer', () => {
    const feedback = useFeedback()

    void feedback.confirm({ title: 'Clear everything?', message: 'This cannot be undone.' })

    expect(feedback.request).toMatchObject({ title: 'Clear everything?' })
  })

  it('resolves true when accepted', async () => {
    const feedback = useFeedback()
    const answer = feedback.confirm({ title: 'Delete?', message: 'Sure?' })

    feedback.resolve(true)

    await expect(answer).resolves.toBe(true)
  })

  it('resolves false when declined', async () => {
    const feedback = useFeedback()
    const answer = feedback.confirm({ title: 'Delete?', message: 'Sure?' })

    feedback.resolve(false)

    await expect(answer).resolves.toBe(false)
  })

  it('clears the question once answered, so the dialog closes', () => {
    const feedback = useFeedback()

    void feedback.confirm({ title: 'Delete?', message: 'Sure?' })
    feedback.resolve(true)

    expect(feedback.request).toBeNull()
  })

  it('declines a pending question when a second one opens', async () => {
    // Stranding the first promise would silently hang whatever awaited it, and declining
    // is the only safe way to resolve a question the user never actually saw answered.
    const feedback = useFeedback()
    const first = feedback.confirm({ title: 'First', message: 'One' })

    void feedback.confirm({ title: 'Second', message: 'Two' })

    await expect(first).resolves.toBe(false)
    expect(feedback.request).toMatchObject({ title: 'Second' })
  })

  it('does nothing when resolving with no question open', () => {
    const feedback = useFeedback()

    expect(() => feedback.resolve(true)).not.toThrow()
  })
})

describe('notify', () => {
  it('adds a toast', () => {
    const feedback = useFeedback()

    feedback.notify('Saved')

    expect(feedback.toasts).toHaveLength(1)
    expect(feedback.toasts[0]).toMatchObject({ message: 'Saved', tone: 'neutral' })
  })

  it('keeps several toasts in the order they arrived', () => {
    const feedback = useFeedback()

    feedback.notify('First')
    feedback.notify('Second')

    expect(feedback.toasts.map((toast) => toast.message)).toEqual(['First', 'Second'])
  })

  it('gives each toast a distinct id even when the message repeats', () => {
    const feedback = useFeedback()

    feedback.notify('Saved')
    feedback.notify('Saved')

    expect(new Set(feedback.toasts.map((toast) => toast.id)).size).toBe(2)
  })

  it('dismisses itself after the display duration', () => {
    const feedback = useFeedback()

    feedback.notify('Saved')
    vi.advanceTimersByTime(TOAST_DURATION_MS)

    expect(feedback.toasts).toEqual([])
  })

  it('stays on screen until the duration has elapsed', () => {
    const feedback = useFeedback()

    feedback.notify('Saved')
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1)

    expect(feedback.toasts).toHaveLength(1)
  })

  it('expires each toast on its own schedule', () => {
    const feedback = useFeedback()

    feedback.notify('First')
    vi.advanceTimersByTime(TOAST_DURATION_MS / 2)
    feedback.notify('Second')
    vi.advanceTimersByTime(TOAST_DURATION_MS / 2)

    expect(feedback.toasts.map((toast) => toast.message)).toEqual(['Second'])
  })
})

describe('dismiss', () => {
  it('removes a toast early', () => {
    const feedback = useFeedback()
    const id = feedback.notify('Saved')

    feedback.dismiss(id)

    expect(feedback.toasts).toEqual([])
  })

  it('leaves the others alone', () => {
    const feedback = useFeedback()
    const id = feedback.notify('First')

    feedback.notify('Second')
    feedback.dismiss(id)

    expect(feedback.toasts.map((toast) => toast.message)).toEqual(['Second'])
  })

  it('ignores an unknown id', () => {
    const feedback = useFeedback()

    feedback.notify('Saved')
    feedback.dismiss(999)

    expect(feedback.toasts).toHaveLength(1)
  })
})
