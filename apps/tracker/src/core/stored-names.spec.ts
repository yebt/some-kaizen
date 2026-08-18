import { describe, expect, it } from 'vitest'

import { DATABASE_NAME } from '@shared/infrastructure/idb/database'
import { BACKUP_FORMAT } from '@modules/data/domain/data-transfer'
import { SHARED_ROUTINE_FORMAT } from '@modules/habits/domain/routine-share'

/**
 * The names that are written down somewhere outside this codebase.
 *
 * The app is spelled *Some Kaizen*. These four are spelled *kaisen*, and that is not an
 * oversight anybody should tidy up. They name a database on somebody's phone and identify
 * files already written to somebody's disk, so correcting the spelling would not rename
 * anything — it would open a second, empty database beside the full one, and refuse every
 * backup and every shared routine the app itself produced.
 *
 * This test exists because that is a genuinely tempting edit: a global find and replace on a
 * misspelling looks like housekeeping right up until the first person opens the app and
 * finds it empty. Failing here is the reminder that the spelling is load-bearing.
 */
describe('the names that live outside this codebase', () => {
  it('keeps the database name it was created under', () => {
    expect(DATABASE_NAME).toBe('some-kaisen')
  })

  it('keeps the backup format string already written into people’s files', () => {
    expect(BACKUP_FORMAT).toBe('some-kaisen.backup')
  })

  it('keeps the shared routine format string, for the same reason', () => {
    expect(SHARED_ROUTINE_FORMAT).toBe('some-kaisen.routine')
  })

  it('keeps the preferences key, so a stored theme survives a rename', async () => {
    // Read from the module rather than restated here: a test asserting its own copy of the
    // string would pass while the real one drifted.
    const source = await import('../core/preferences-store?raw')

    expect(source.default).toContain("const STORAGE_KEY = 'some-kaisen.preferences'")
  })
})
