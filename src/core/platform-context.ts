import { inject, type InjectionKey } from 'vue'

import { isNativePlatform } from '@shared/platform'
import type { FileExchange } from '@modules/data/domain/file-exchange'
import { createBrowserFileExchange } from '@modules/data/infrastructure/browser-file-exchange'
import { createCapacitorFileExchange } from '@modules/data/infrastructure/capacitor-file-exchange'
import type { ReminderScheduler } from '@modules/reminders/domain/reminder-scheduler'
import { createCapacitorReminderScheduler } from '@modules/reminders/infrastructure/capacitor-reminder-scheduler'
import { createUnsupportedReminderScheduler } from '@modules/reminders/infrastructure/unsupported-reminder-scheduler'

/**
 * The two capabilities that differ between a browser tab and the installed app.
 *
 * Chosen once here so no screen ever asks which platform it is on. A component that branches
 * on the platform is a component that will eventually branch wrongly.
 */
export interface PlatformServices {
  readonly files: FileExchange
  readonly reminders: ReminderScheduler
}

export const PLATFORM_KEY: InjectionKey<PlatformServices> = Symbol('platform')

export function createPlatformServices(): PlatformServices {
  return isNativePlatform()
    ? { files: createCapacitorFileExchange(), reminders: createCapacitorReminderScheduler() }
    : { files: createBrowserFileExchange(), reminders: createUnsupportedReminderScheduler() }
}

export function usePlatform(): PlatformServices {
  const platform = inject(PLATFORM_KEY)

  if (!platform) throw new Error('No platform services were provided.')

  return platform
}
