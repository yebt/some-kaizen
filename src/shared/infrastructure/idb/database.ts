/**
 * The IndexedDB schema.
 *
 * IndexedDB rather than localStorage because this app accumulates one record per habit per
 * day forever. A year of five habits is already a few thousand rows, and localStorage is a
 * synchronous 5 MB string that would block the main thread on every write and eventually
 * throw with no warning.
 */
export const DATABASE_NAME = 'some-kaisen'
export const DATABASE_VERSION = 1

export const STORE = {
  habits: 'habits',
  entries: 'entries',
  instances: 'instances',
  blocks: 'blocks',
} as const

export type StoreName = (typeof STORE)[keyof typeof STORE]

/**
 * Every record is wrapped rather than stored bare.
 *
 * `updatedAt` and the `deletedAt` tombstone exist from version one even though nothing
 * reads them yet. Sync is a stated goal, and a deleted row that leaves no trace is
 * indistinguishable from a row another device has not seen yet: without the tombstone the
 * first sync would happily resurrect everything you ever deleted. Adding these later would
 * mean a migration over the user's whole history, so they are cheap now and expensive
 * afterwards.
 */
export interface StoredRecord<T> {
  readonly id: string
  readonly value: T
  readonly updatedAt: number
  readonly deletedAt?: number
}

export class DatabaseUnavailableError extends Error {
  /** Held as a field rather than through Error.cause, which is outside the compiled lib. */
  constructor(readonly reason: unknown) {
    super('The local database could not be opened.')
    this.name = 'DatabaseUnavailableError'
  }
}

/** Wraps an IDBRequest so the rest of the codebase can stay in promise land. */
export function fromRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Opens the database, creating or upgrading the object stores as needed.
 *
 * The name is injectable so a test can work against its own isolated database instead of
 * racing every other test through one shared global.
 */
export function openDatabase(name: string = DATABASE_NAME): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, DATABASE_VERSION)

    request.onupgradeneeded = () => {
      const database = request.result

      for (const storeName of Object.values(STORE)) {
        if (database.objectStoreNames.contains(storeName)) continue

        const store = database.createObjectStore(storeName, { keyPath: 'id' })

        // Indexed so a future sync can ask for everything touched since a watermark
        // without walking the entire history.
        store.createIndex('updatedAt', 'updatedAt')
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new DatabaseUnavailableError(request.error))
    request.onblocked = () =>
      reject(new DatabaseUnavailableError('Another tab is holding an older version open.'))
  })
}
