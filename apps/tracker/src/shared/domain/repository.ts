import type { Identifier } from './identifier'

/** Anything the app stores and retrieves by its own identity. */
export interface Entity {
  readonly id: Identifier
}

/**
 * The port every module's storage is reached through.
 *
 * Declared in the domain and implemented in infrastructure, so the domain never learns that
 * IndexedDB exists. That is what makes the promised sync a second adapter behind the same
 * port rather than a rewrite of everything that touches data.
 *
 * Every method is async even though IndexedDB could be hidden behind a cache, because a
 * port that lies about being synchronous cannot later be backed by anything that is not.
 */
export interface Repository<T extends Entity> {
  all(): Promise<T[]>
  find(id: Identifier): Promise<T | undefined>
  save(entity: T): Promise<void>
  saveAll(entities: readonly T[]): Promise<void>
  remove(id: Identifier): Promise<void>
  /** Replaces the entire contents, as a data import does. */
  replaceAll(entities: readonly T[]): Promise<void>
}
