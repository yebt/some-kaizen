import { Capacitor } from '@capacitor/core'

/**
 * Whether the app is running inside the native shell rather than a browser tab.
 *
 * Asked at the composition root only. Screens are handed an adapter that already suits
 * wherever they are, so no component ever branches on the platform, which is what stops
 * "if native" creeping through the interface.
 */
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform()
}
