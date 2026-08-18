/**
 * Getting a file out of the app and back into it.
 *
 * A port because the two environments do it completely differently: a browser downloads and
 * reads through an input element, while the native shell writes to the filesystem and hands
 * the file to the system share sheet. The screens should not know which one they are on.
 */
export interface FileExchange {
  /** Writes the contents out under the given name, however this platform does that. */
  save(fileName: string, contents: string): Promise<void>
  /** Asks the user for a file and returns its text, or nothing if they backed out. */
  pick(): Promise<string | null>
}

/** `some-kaisen-2026-03-11.json`, so several backups sort and read sensibly in a folder. */
export function backupFileName(exportedAt: Date): string {
  const year = exportedAt.getFullYear()
  const month = String(exportedAt.getMonth() + 1).padStart(2, '0')
  const day = String(exportedAt.getDate()).padStart(2, '0')

  return `some-kaisen-${year}-${month}-${day}.json`
}
