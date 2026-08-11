import type { FileExchange } from '@modules/data/domain/file-exchange'

/**
 * Browser implementation of the file port.
 *
 * Needs no permissions at all: a download triggered by a click and a file chosen through an
 * input are both user gestures the browser already trusts. The native adapter is where
 * permissions become a question, and even there the modern answer is to write into the
 * app's own directory and hand the file to the share sheet rather than ask for access to
 * shared storage.
 */
export function createBrowserFileExchange(): FileExchange {
  return {
    async save(fileName, contents) {
      const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }))
      const link = document.createElement('a')

      link.href = url
      link.download = fileName
      document.body.append(link)
      link.click()
      link.remove()

      // Released on the next tick: revoking synchronously can cancel the download in some
      // browsers before it has actually started reading the blob.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    },

    pick() {
      return new Promise<string | null>((resolve) => {
        const input = document.createElement('input')

        input.type = 'file'
        input.accept = 'application/json,.json'

        // There is no reliable "cancelled" event across browsers, so a dismissed picker
        // simply never resolves the change handler. The element is detached either way.
        input.addEventListener('change', () => {
          const file = input.files?.[0]

          input.remove()

          if (!file) {
            resolve(null)

            return
          }

          file
            .text()
            .then(resolve)
            .catch(() => resolve(null))
        })

        input.addEventListener('cancel', () => {
          input.remove()
          resolve(null)
        })

        document.body.append(input)
        input.click()
      })
    },
  }
}
