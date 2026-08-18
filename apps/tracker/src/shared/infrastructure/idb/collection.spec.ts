import 'fake-indexeddb/auto'

import { beforeEach, describe, expect, it } from 'vitest'
import { reactive } from 'vue'

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

describe('what a tombstone keeps', () => {
  it('does not keep the record it buried', async () => {
    // Deleting a habit called "quit drinking" has to remove that text from the device.
    // A tombstone needs the identifier and the moment, and nothing else.
    await notes.put('a', { title: 'Quit drinking' })
    await notes.remove('a')

    expect((await rawRecord('a'))?.value).toBeUndefined()
  })

  it('still says the record existed and when it stopped', async () => {
    await notes.put('a', { title: 'Meditate' })
    clock = 2_000
    await notes.remove('a')

    const stored = await rawRecord('a')

    expect(stored?.id).toBe('a')
    expect(stored?.deletedAt).toBe(2_000)
  })
})

describe('replaceAll', () => {
  it('makes the store hold exactly what it was given', async () => {
    await notes.put('a', { title: 'Meditate' })
    await notes.replaceAll([{ id: 'b', value: { title: 'Run' } }])

    expect(await notes.all()).toEqual([{ title: 'Run' }])
  })

  it('buries what it removed rather than making it vanish', async () => {
    // A record that disappears without a tombstone is indistinguishable from one another
    // device has never seen, so the first sync would hand the whole import straight back.
    await notes.put('a', { title: 'Meditate' })
    await notes.replaceAll([{ id: 'b', value: { title: 'Run' } }])

    expect((await rawRecord('a'))?.deletedAt).toBeDefined()
  })

  it('drops the value of what it buried', async () => {
    await notes.put('a', { title: 'Quit drinking' })
    await notes.replaceAll([])

    expect((await rawRecord('a'))?.value).toBeUndefined()
  })

  it('brings a record back to life when the incoming set still has it', async () => {
    await notes.put('a', { title: 'Meditate' })
    await notes.remove('a')
    await notes.replaceAll([{ id: 'a', value: { title: 'Meditate' } }])

    expect(await notes.get('a')).toEqual({ title: 'Meditate' })
  })

  it('leaves an existing tombstone alone rather than restamping it', async () => {
    // Re-dating a deletion nobody touched would make it outrank a later edit elsewhere.
    await notes.put('a', { title: 'Meditate' })
    clock = 2_000
    await notes.remove('a')
    clock = 3_000
    await notes.replaceAll([{ id: 'b', value: { title: 'Run' } }])

    expect((await rawRecord('a'))?.deletedAt).toBe(2_000)
  })

  it('empties the store when given nothing', async () => {
    await notes.put('a', { title: 'Meditate' })
    await notes.replaceAll([])

    expect(await notes.all()).toEqual([])
  })
})

describe('records arriving from the screens', () => {
  interface Grouped {
    readonly title: string
    readonly members: string[]
    readonly detail: { readonly depth: number }
  }

  let grouped: Collection<Grouped>

  beforeEach(() => {
    grouped = createCollection<Grouped>(database, STORE.routines, () => clock)
  })

  function routine(): Grouped {
    return { title: 'Morning', members: ['one', 'two'], detail: { depth: 1 } }
  }

  it('stores one wrapped in reactivity, which is what every screen hands it', async () => {
    /*
     * The regression that matters, and one this suite could not previously see.
     *
     * Screens read their records from a query cache, so what they hand back is reactive, and
     * the ordinary way to write a change — spread the record, replace one field — copies the
     * top level while leaving every nested array and object a proxy underneath. A real
     * browser refuses to structured clone a proxy: the write fails with `DataCloneError` and
     * the change is silently lost. Archiving a routine did exactly nothing for this reason,
     * because its `habitIds` arrived as a proxy.
     *
     * `fake-indexeddb` clones permissively and accepts the proxy either way, so watching the
     * write succeed proves nothing here. What is asserted is the *shape* that reaches the
     * store — plain arrays and objects, detached from the original — which is true in both
     * and is what the browser actually requires.
     */
    const live = reactive(routine())
    const edited = { ...live, title: 'Evening' }

    await grouped.put('a', edited)

    const stored = await grouped.get('a')

    expect(stored).toEqual({ ...routine(), title: 'Evening' })
    expect(stored?.members).not.toBe(edited.members)
    expect(Object.getPrototypeOf(stored?.members ?? {})).toBe(Array.prototype)
  })

  it('detaches the copy, so editing the original afterwards rewrites nothing', async () => {
    // A record handed to storage is a value, not a live reference. Sharing the array would
    // let a later edit on screen quietly change history nobody asked to change.
    const original = routine()

    await grouped.put('a', original)
    original.members.push('three')

    expect((await grouped.get('a'))?.members).toEqual(['one', 'two'])
  })

  it('detaches every record written as a set', async () => {
    await grouped.putMany([
      { id: 'a', value: reactive(routine()) },
      { id: 'b', value: reactive({ ...routine(), title: 'Evening' }) },
    ])

    const stored = await grouped.all()

    expect(stored.map((one) => one.members)).toEqual([
      ['one', 'two'],
      ['one', 'two'],
    ])
  })

  it('detaches records written by a wholesale replace', async () => {
    await grouped.replaceAll([{ id: 'a', value: reactive(routine()) }])

    expect((await grouped.all())[0]).toEqual(routine())
  })
})
