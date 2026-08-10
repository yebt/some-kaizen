/**
 * A stable identity for a stored record, held as a UUID.
 *
 * Identifiers are minted on the device rather than handed out by a server, because the app
 * is offline first and a habit created on a plane must already have its final identity by
 * the time the future sync sees it. A collision would silently merge two habits, so this is
 * a UUID rather than a counter or a timestamp.
 */
export type Identifier = string & { readonly __brand: unique symbol }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export class InvalidIdentifierError extends Error {
  constructor(readonly value: string) {
    super(`"${value}" is not a valid identifier, expected a UUID.`)
    this.name = 'InvalidIdentifierError'
  }
}

/** Parses a stored or imported identifier, normalising case so equality stays reliable. */
export function identifier(value: string): Identifier {
  const normalised = value.toLowerCase()

  if (!UUID_PATTERN.test(normalised)) throw new InvalidIdentifierError(value)

  return normalised as Identifier
}

/**
 * Mints a random version 4 UUID.
 *
 * Deliberately built on `crypto.getRandomValues` rather than `crypto.randomUUID`, which is
 * only defined in a secure context. Opening the app over a plain LAN address such as
 * `http://192.168.1.18:5173` — exactly how it is tested on a real handset — is not a secure
 * context, so `randomUUID` is undefined there and every screen that creates a record throws
 * on setup. `getRandomValues` carries no such restriction and works identically in a browser
 * tab, in the Android WebView and under the test runner.
 */
export function newIdentifier(): Identifier {
  const bytes = crypto.getRandomValues(new Uint8Array(16))

  // RFC 4122: byte 6 carries the version nibble, byte 8 the variant bits.
  const tagged = Uint8Array.from(bytes, (byte, index) => {
    if (index === 6) return (byte & 0x0f) | 0x40
    if (index === 8) return (byte & 0x3f) | 0x80

    return byte
  })

  const hex = Array.from(tagged, (byte) => byte.toString(16).padStart(2, '0')).join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as Identifier
}
