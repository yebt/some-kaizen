import type { Router } from 'vue-router'

import { isNativePlatform } from '@shared/platform'
import { handleBack } from '@shared/ui/back-stack'

/**
 * What the back gesture can do, named rather than reached for.
 *
 * The rule below is worth proving, and proving it against a real router and a real Android
 * bridge is not possible in a test. Naming the three moves it can make leaves the rule as
 * ordinary code.
 */
export interface BackNavigation {
  /** Whether there is a screen behind this one, as opposed to this being where we started. */
  readonly hasPreviousScreen: () => boolean
  readonly goBack: () => void
  readonly exit: () => void
}

/**
 * Answers the hardware back button, most local thing first.
 *
 * The order is the whole rule. Back means "undo the last thing that appeared": an open
 * sheet before a route, a route before the app itself. Closing the screen behind an open
 * dialog, or leaving the app while a sheet is up, are both the same mistake made at the
 * wrong level.
 *
 * Falling through to exit rather than doing nothing matters just as much. On Android, back
 * from the first screen closes the app, and an app that simply ignores it is one the user
 * has to kill from the task switcher.
 */
export function respondToBack(navigation: BackNavigation): void {
  if (handleBack()) return

  if (navigation.hasPreviousScreen()) {
    navigation.goBack()

    return
  }

  navigation.exit()
}

/**
 * Wires the gesture to the installed app, and to nothing at all in a browser tab.
 *
 * The plugin is imported lazily so it never reaches the web bundle: a browser has its own
 * back button, wired to the same history this router already uses, and taking that over
 * would replace something that works with something that merely imitates it.
 */
export async function installBackButton(router: Router): Promise<void> {
  if (!isNativePlatform()) return

  const { App } = await import('@capacitor/app')

  await App.addListener('backButton', () => {
    respondToBack({
      // Vue Router keeps the entry it came from in history state, which is the only honest
      // answer here: `history.length` counts the whole tab, including pages before this app.
      hasPreviousScreen: () => router.options.history.state.back != null,
      goBack: () => router.back(),
      exit: () => void App.exitApp(),
    })
  })
}
