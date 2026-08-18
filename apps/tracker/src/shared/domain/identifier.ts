import { v4 as uuidV4, v5 as uuidV5 } from 'uuid'

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

/**
 * The namespace every derived identifier in this app is minted under.
 *
 * A fixed constant rather than a generated one: the whole point is that two devices which
 * have never spoken produce the same identifier for the same thing, and that only holds if
 * the namespace is part of the source rather than part of a device's state.
 */
const DERIVED_NAMESPACE = '6f9a1c2e-4b7d-5e18-9c3a-2d5f8b1e7a04'

/**
 * Mints an identifier from what makes a record unique rather than from randomness.
 *
 * Some records are not really new things, they are *the* thing that belongs at a particular
 * place: the second occurrence of a habit on a given day is that occurrence no matter which
 * device first noticed it. Giving those a random identifier means two devices independently
 * doing the same obvious thing create two records for one event, which no later merge can
 * repair because at the record level there is no conflict to resolve.
 *
 * Deliberate creations keep random identifiers. Three gym sessions someone actually planned
 * for Saturday are three different things and must stay three.
 */
export function derivedIdentifier(...parts: readonly string[]): Identifier {
  // A separator that cannot appear in the parts, so ('a', 'bc') and ('ab', 'c') differ.
  return uuidV5(parts.join('\u0000'), DERIVED_NAMESPACE) as Identifier
}
