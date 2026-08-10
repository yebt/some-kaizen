import { v4 as uuidV4 } from 'uuid'

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
 * `uuid` is used rather than `crypto.randomUUID` directly: that API only exists in a secure
 * context, and opening the app over a plain LAN address such as `http://192.168.1.18:5173`,
 * which is exactly how it is tested on a real handset, is not one. The library reaches for
 * `randomUUID` when it is present and falls back to `crypto.getRandomValues` when it is not,
 * so the same call works in a browser tab, in the Android WebView and under the test runner.
 * The accompanying spec pins that fallback, because it is a property of the dependency
 * rather than of our code.
 */
export function newIdentifier(): Identifier {
  return uuidV4() as Identifier
}
