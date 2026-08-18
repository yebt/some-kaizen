import { type Challenge, createChallenge, type MissRule } from './challenge'
import type { ChallengeMint } from './challenge-presets'

/**
 * A programme somebody wrote themselves, as it arrives from a form.
 *
 * Task names rather than tasks, because a form has rows of text and no opinion about
 * identity. Minting the identifiers is this module's job, and doing it here rather than in
 * the screen is what keeps two attempts at the same programme from ever sharing a tick.
 */
export interface OwnChallengeDraft {
  readonly name: string
  readonly lengthDays: number
  readonly onMiss: MissRule
  readonly taskNames: readonly string[]
}

/**
 * Builds a challenge from what was typed.
 *
 * The one rule that lives here rather than in `createChallenge`: a blank row is a row you did
 * not fill in, not a task with no name. A form that offers somewhere to type gets rows that
 * stay empty, and rejecting the whole thing over one of them would be the app refusing to
 * understand something obvious. Refusing a programme with nothing in it at all is a different
 * claim, and the model still makes it.
 *
 * Two rows reading the same thing stay two tasks. Deduplicating them would be deciding we
 * understood the intent better than the person who typed it.
 */
export function challengeFromNames(draft: OwnChallengeDraft, mint: ChallengeMint): Challenge {
  return createChallenge({
    id: mint.id,
    name: draft.name,
    lengthDays: draft.lengthDays,
    tasks: draft.taskNames
      .filter((name) => name.trim() !== '')
      .map((name) => ({ id: mint.newTaskId(), name })),
    startedOn: mint.startedOn,
    onMiss: draft.onMiss,
  })
}
