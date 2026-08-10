import { inject, type InjectionKey } from 'vue'

import type { Persistence } from './persistence'

/**
 * Storage is injected rather than imported.
 *
 * A module level singleton would work in the app and be miserable in tests: every spec
 * would share one database and the composables could never be handed a fake. Injection
 * keeps the composition root the only place that decides which adapter is in use.
 */
export const PERSISTENCE_KEY: InjectionKey<Persistence> = Symbol('persistence')

export function usePersistence(): Persistence {
  const persistence = inject(PERSISTENCE_KEY)

  if (!persistence) {
    throw new Error('No persistence was provided. Did the app fail to open the database?')
  }

  return persistence
}
