import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'

import { type Collection, createCollection } from './collection'
import { fromRequest, openDatabase, STORE, type StoredRecord } from './database'

interface Note {
  readonly title: string
}

let database: IDBDatabase
let notes: Collection<Note>
let clock: number

/** Each spec gets its own database so the shared fake global cannot leak between tests. */
let databaseCounter = 0

beforeEach(async () => {
  databaseCounter += 1
  clock = 1_000
  database = await openDatabase(`collection-spec-${databaseCounter}`)
  notes = createCollection<Note>(database, STORE.habits, () => clock)
})

function rawRecord(id: string) {
  return fromRequest<StoredRecord<Note> | undefined>(
    database.transaction(STORE.habits, 'readonly').objectStore(STORE.habits).get(id) as IDBRequest<
      StoredRecord<Note> | undefined
    >,
  )
}

describe('put and get', () => {
  it('round trips a value', async () => {
    await notes.put('a', { title: 'Meditate' })

    expect(await notes.get('a')).toEqual({ title: 'Meditate' })
  })

  it('returns undefined for an unknown id', async () => {
    expect(await notes.get('missing')).toBeUndefined()
  })

  it('overwrites an existing value', async () => {
    await notes.put('a', { title: 'First' })
    await notes.put('a', { title: 'Second' })

    expect(await notes.get('a')).toEqual({ title: 'Second' })
  })

  it('resolves only once the write is durable', async () => {
    await notes.put('a', { title: 'Meditate' })

    // A fresh read straight after the promise settles must already see it, which is only
    // true if the transaction completed rather than merely the request succeeding.
    expect(await notes.get('a')).toBeDefined()
  })
})

describe('all', () => {
  it('is empty for a fresh store', async () => {
    expect(await notes.all()).toEqual([])
  })

  it('returns every live value', async () => {
    await notes.putMany([
      { id: 'a', value: { title: 'Meditate' } },
      { id: 'b', value: { title: 'Run' } },
    ])

    expect((await notes.all()).map((note) => note.title).sort()).toEqual(['Meditate', 'Run'])
  })
})

describe('putMany', () => {
  it('writes a batch in one transaction', async () => {
    await notes.putMany([
      { id: 'a', value: { title: 'Meditate' } },
      { id: 'b', value: { title: 'Run' } },
    ])

    expect(await notes.get('b')).toEqual({ title: 'Run' })
  })

  it('accepts an empty batch without opening a transaction', async () => {
    await expect(notes.putMany([])).resolves.toBeUndefined()
  })

  it('stamps the whole batch with one timestamp', async () => {
    await notes.putMany([
      { id: 'a', value: { title: 'Meditate' } },
      { id: 'b', value: { title: 'Run' } },
    ])

    const [first, second] = [await rawRecord('a'), await rawRecord('b')]

    expect(first?.updatedAt).toBe(second?.updatedAt)
  })
})

describe('remove', () => {
  it('hides the value from reads', async () => {
    await notes.put('a', { title: 'Meditate' })
    await notes.remove('a')

    expect(await notes.get('a')).toBeUndefined()
    expect(await notes.all()).toEqual([])
  })

  it('leaves a tombstone rather than erasing the row', async () => {
    // Without the tombstone a future sync cannot tell a deletion from a record the other
    // device has simply never seen, and would cheerfully resurrect it.
    await notes.put('a', { title: 'Meditate' })
    await notes.remove('a')

    const stored = await rawRecord('a')

    expect(stored).toBeDefined()
    expect(stored?.deletedAt).toBe(clock)
  })

  it('does nothing for an unknown id', async () => {
    await expect(notes.remove('missing')).resolves.toBeUndefined()
    expect(await rawRecord('missing')).toBeUndefined()
  })

  it('allows the id to be written again afterwards', async () => {
    await notes.put('a', { title: 'Meditate' })
    await notes.remove('a')
    await notes.put('a', { title: 'Back again' })

    expect(await notes.get('a')).toEqual({ title: 'Back again' })
  })

  it('clears the tombstone when the id is written again', async () => {
    await notes.put('a', { title: 'Meditate' })
    await notes.remove('a')
    await notes.put('a', { title: 'Back again' })

    expect((await rawRecord('a'))?.deletedAt).toBeUndefined()
  })
})

describe('clear', () => {
  it('removes everything including tombstones, as an import replacing the dataset needs', async () => {
    await notes.put('a', { title: 'Meditate' })
    await notes.remove('a')
    await notes.put('b', { title: 'Run' })

    await notes.clear()

    expect(await notes.all()).toEqual([])
    expect(await rawRecord('a')).toBeUndefined()
  })
})

describe('updatedAt', () => {
  it('records when the value was written', async () => {
    clock = 5_000
    await notes.put('a', { title: 'Meditate' })

    expect((await rawRecord('a'))?.updatedAt).toBe(5_000)
  })

  it('moves forward on every write', async () => {
    await notes.put('a', { title: 'First' })
    clock = 9_000
    await notes.put('a', { title: 'Second' })

    expect((await rawRecord('a'))?.updatedAt).toBe(9_000)
  })
})
