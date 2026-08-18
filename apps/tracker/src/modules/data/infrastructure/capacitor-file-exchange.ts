import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'

import type { FileExchange } from '@modules/data/domain/file-exchange'

import { createBrowserFileExchange } from './browser-file-exchange'

/**
 * The native side of getting a backup in and out.
 *
 * Writing goes to the app's own cache directory and is then handed to the system share
 * sheet, which is deliberately how this avoids asking for storage permissions at all. On
 * modern Android an app writing into shared storage needs a permission the user has every
 * right to refuse; letting them choose the destination through the share sheet needs none,
 * and gives them somewhere better than a Downloads folder anyway.
 *
 * Reading reuses the browser implementation. A file input inside the WebView opens the
 * system document picker, so a dedicated picker plugin would add a dependency and a
 * permission surface to do exactly what already works.
 */
export function createCapacitorFileExchange(): FileExchange {
  const browser = createBrowserFileExchange()

  return {
    async save(fileName, contents) {
      const written = await Filesystem.writeFile({
        path: fileName,
        data: contents,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      })

      await Share.share({
        title: 'Some Kaizen backup',
        // Some targets read the file and some read the text, so both are offered.
        url: written.uri,
        dialogTitle: 'Save your backup',
      })
    },

    pick: () => browser.pick(),
  }
}
