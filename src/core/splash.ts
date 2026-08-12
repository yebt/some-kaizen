import { isNativePlatform } from '@shared/platform'

/**
 * Lifts the launch screen once there is something behind it.
 *
 * The splash is not decoration here: the database opens asynchronously, so for the first
 * moments the app genuinely has nothing to show, and a blank canvas in that gap reads as a
 * crash. Hiding it from the app rather than on a timer means it lasts exactly as long as
 * the wait it exists for.
 *
 * Never throws. A splash that refuses to lift would hide a working app behind a picture of
 * one, which is far worse than the plugin being unavailable.
 */
export async function hideSplash(): Promise<void> {
  if (!isNativePlatform()) return

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen')

    await SplashScreen.hide()
  } catch (error) {
    console.error(error)
  }
}
