import { beforeEach, describe, expect, it, vi } from 'vitest'

import { pushBackHandler, resetBackHandlers } from '@shared/ui/back-stack'

import { type BackNavigation, respondToBack } from './back-button'

beforeEach(resetBackHandlers)

function navigation(hasPreviousScreen: boolean): BackNavigation & {
  went: { back: number; out: number }
} {
  const went = { back: 0, out: 0 }

  return {
    went,
    hasPreviousScreen: () => hasPreviousScreen,
    goBack: () => {
      went.back += 1
    },
    exit: () => {
      went.out += 1
    },
  }
}

describe('answering the back button', () => {
  it('closes what is open before touching the route', () => {
    // Otherwise the screen behind an open sheet changes and the sheet floats over the wrong
    // page, which is the single most common way an app feels broken on a phone.
    const dismiss = vi.fn<() => void>()

    pushBackHandler(dismiss)

    const target = navigation(true)

    respondToBack(target)

    expect(dismiss).toHaveBeenCalledOnce()
    expect(target.went).toEqual({ back: 0, out: 0 })
  })

  it('goes back a screen when nothing is open', () => {
    const target = navigation(true)

    respondToBack(target)

    expect(target.went).toEqual({ back: 1, out: 0 })
  })

  it('leaves the app from the screen it started on', () => {
    // Android expects this. An app that swallows back on its first screen has to be killed
    // from the task switcher.
    const target = navigation(false)

    respondToBack(target)

    expect(target.went).toEqual({ back: 0, out: 1 })
  })

  it('unwinds nested sheets one at a time, newest first', () => {
    const outer = vi.fn<() => void>()
    const inner = vi.fn<() => void>()

    pushBackHandler(outer)
    const releaseInner = pushBackHandler(inner)

    respondToBack(navigation(true))

    expect(inner).toHaveBeenCalledOnce()
    expect(outer).not.toHaveBeenCalled()

    releaseInner()
    respondToBack(navigation(true))

    expect(outer).toHaveBeenCalledOnce()
  })

  it('stops claiming the gesture once what was open has been released', () => {
    const release = pushBackHandler(vi.fn<() => void>())

    release()

    const target = navigation(true)

    respondToBack(target)

    expect(target.went.back).toBe(1)
  })

  it('releases a handler that is no longer on top without disturbing the others', () => {
    // A dialog can be unmounted by a route change while a confirmation it opened is still
    // registered above it.
    const buried = vi.fn<() => void>()
    const top = vi.fn<() => void>()

    const releaseBuried = pushBackHandler(buried)

    pushBackHandler(top)
    releaseBuried()

    respondToBack(navigation(true))

    expect(top).toHaveBeenCalledOnce()
    expect(buried).not.toHaveBeenCalled()
  })
})
