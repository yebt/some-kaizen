import { fromRequest, type StoredRecord, type StoreName } from './database'

/**
 * A typed view over one object store.
 *
 * Domain objects are stored exactly as the domain defines them, with the storage concerns —
 * timestamps, tombstones — held in the wrapper around them rather than mixed in. That is
 * what keeps the domain free of persistence noise and lets a future sync adapter reuse the
 * same entities untouched.
 */
export interface Collection<T> {
  all(): Promise<T[]>
  get(id: string): Promise<T | undefined>
  put(id: string, value: T): Promise<void>
  putMany(records: ReadonlyArray<{ id: string; value: T }>): Promise<void>
  /** Soft deletes, leaving a tombstone so a future sync cannot resurrect the record. */
  remove(id: string): Promise<void>
  /**
   * Makes the store hold exactly these records, burying whatever else was there.
   *
   * Not a wipe followed by a write. A record that disappears without a tombstone is
   * indistinguishable from one another device has simply never seen, so the first sync after
   * an import would hand back everything the import was meant to replace.
   */
  replaceAll(records: ReadonlyArray<{ id: string; value: T }>): Promise<void>
  /**
   * Hard wipes the store, tombstones included, leaving nothing to say anything was ever here.
   *
   * The escape hatch, not the ordinary path: it is the only operation that can lose a
   * deletion, so it belongs to a device leaving rather than a dataset changing.
   */
  clear(): Promise<void>
}

/**
 * A plain snapshot of a record, safe for IndexedDB to clone.
 *
 * This is the boundary where a value stops being something the UI holds and becomes
 * something the disk holds, and it is the only place that can be relied on to enforce it.
 *
 * The screens read their records from a query cache, so what they hand back is wrapped in
 * Vue's reactivity. Spreading one — `{ ...routine, archivedOn: today }` is the ordinary way
 * to write a change — copies the top level and leaves every nested array and object as a
 * proxy underneath. A proxy cannot be structured cloned, so the write fails with
 * `DataCloneError` and the change is silently lost.
 *
 * That shipped. Archiving a routine did nothing at all, because its `habitIds` array arrived
 * as a proxy, and nothing in the test suite could see it: `fake-indexeddb` clones with its
 * own permissive implementation and accepts what a browser refuses. Asking every caller to
 * remember is what was already being done, and it is what failed.
 *
 * A JSON round trip rather than `structuredClone`, which fails on the same proxies, or a
 * recursive `toRaw`, which would drag Vue into the storage adapter. Everything stored here is
 * already JSON-safe by construction — the backup format is exactly this serialisation, and
 * every value is a string, a number, a boolean, a plain object or an array of those. Keys
 * that are present and undefined are dropped, which reads back identically to absent.
 */
function storable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function createCollection<T>(
  database: IDBDatabase,
  storeName: StoreName,
  now: () => number = Date.now,
): Collection<T> {
  function transaction(mode: IDBTransactionMode) {
    return database.transaction(storeName, mode).objectStore(storeName)
  }

  /** Waits for the whole transaction, not just the request, so writes are durable on return. */
  function committed(store: IDBObjectStore): Promise<void> {
    return new Promise((resolve, reject) => {
      store.transaction.oncomplete = () => resolve()
      store.transaction.onerror = () => reject(store.transaction.error)
      store.transaction.onabort = () => reject(store.transaction.error)
    })
  }

  return {
    async all() {
      const records = await fromRequest<StoredRecord<T>[]>(
        transaction('readonly').getAll() as IDBRequest<StoredRecord<T>[]>,
      )

      return records.flatMap((record) =>
        record.deletedAt === undefined && record.value !== undefined ? [record.value] : [],
      )
    },

    async get(id) {
      const record = await fromRequest<StoredRecord<T> | undefined>(
        transaction('readonly').get(id) as IDBRequest<StoredRecord<T> | undefined>,
      )

      if (!record || record.deletedAt !== undefined) return undefined

      return record.value
    },

    async put(id, value) {
      const store = transaction('readwrite')

      store.put({ id, value: storable(value), updatedAt: now() } satisfies StoredRecord<T>)

      return committed(store)
    },

    async putMany(records) {
      if (records.length === 0) return

      const store = transaction('readwrite')
      const timestamp = now()

      for (const record of records) {
        store.put({ id: record.id, value: storable(record.value), updatedAt: timestamp })
      }

      return committed(store)
    },

    async remove(id) {
      const readStore = transaction('readonly')
      const existing = await fromRequest<StoredRecord<T> | undefined>(
        readStore.get(id) as IDBRequest<StoredRecord<T> | undefined>,
      )

      if (!existing) return

      const timestamp = now()
      const store = transaction('readwrite')

      // The value is dropped rather than carried into the tombstone. What survives is that
      // this identifier existed and when it stopped.
      store.put({ id, updatedAt: timestamp, deletedAt: timestamp } satisfies StoredRecord<T>)

      return committed(store)
    },

    async replaceAll(records) {
      const readStore = transaction('readonly')
      const existing = await fromRequest<StoredRecord<T>[]>(
        readStore.getAll() as IDBRequest<StoredRecord<T>[]>,
      )

      const incoming = new Set(records.map((record) => record.id))
      const timestamp = now()
      const store = transaction('readwrite')

      for (const record of existing) {
        if (incoming.has(record.id) || record.deletedAt !== undefined) continue

        store.put({ id: record.id, updatedAt: timestamp, deletedAt: timestamp })
      }

      for (const record of records) {
        store.put({ id: record.id, value: storable(record.value), updatedAt: timestamp })
      }

      return committed(store)
    },

    async clear() {
      const store = transaction('readwrite')

      store.clear()

      return committed(store)
    },
  }
}
