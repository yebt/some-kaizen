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

export function newIdentifier(): Identifier {
  return crypto.randomUUID() as Identifier
}
