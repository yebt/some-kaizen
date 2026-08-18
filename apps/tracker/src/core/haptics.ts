import { isNativePlatform } from '@shared/platform'

/**
 * A tick you feel rather than see.
 *
 * Reserved for detents: the moment a control passes a value it could settle on. That is the
 * one thing a screen genuinely cannot say — a wheel with stops feels like a wheel with stops,
 * and the same wheel drawn without the feedback feels like a slider pretending.
 *
 * Deliberately not used for confirmation, arrival or error. Vibration that accompanies
 * everything stops meaning anything, and on a phone in a pocket it is the fastest way to make
 * someone turn the whole app's feedback off.
 */
let plugin: Promise<{ impact: (options: { style: string }) => Promise<void> } | null> | null = null

async function load() {
  if (!isNativePlatform()) return null

  plugin ??= import('@capacitor/haptics')
    .then((module) => ({
      impact: (options: { style: string }) =>
        module.Haptics.impact({ style: options.style as never }),
    }))
    .catch(() => null)

  return plugin
}

/**
 * Fires and forgets.
 *
 * A missing plugin, a denied permission or a device with no motor are all the same answer —
 * no tick — and none of them is worth an error path in a caller whose real job is moving a
 * card. Silence is the correct degradation.
 */
export function tick(): void {
  void load()
    .then((haptics) => haptics?.impact({ style: 'Light' }))
    .catch(() => undefined)
}
