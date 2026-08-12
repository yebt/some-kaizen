# Optional sync

*A design proposal. Nothing here is implemented.*

## Why this document exists

The app works, completely, with no account and no network, and that is not an accident of it
being early — it is the product. Sync must not change that. What follows is modelled on how
Obsidian treats sync: the vault is a folder of files that works forever on its own, and sync
is a thing you deliberately turn on, point at somewhere, and can turn off again with every
byte still on your disk.

The concrete promise this proposal has to keep: **turning sync off is not a data operation.**
It removes a link. It does not remove records.

---

## 1. The conflict model

### What the data actually is

Before choosing a merge strategy it is worth being precise about the four collections,
because they are not the same kind of thing and the literature's default answer is wrong for
at least two of them.

- **`habits`** — long-lived mutable entities, edited rarely, through a form (`HabitForm.vue`)
  that rebuilds the whole object and keeps the id. There is no partial edit anywhere in the
  UI.
- **`entries`** — verdicts about a day. Positive entries are *edited in place*: `index.vue`'s
  `setCompleted` and `saveAmount` reuse `entryId` when one exists, so correcting today's run
  overwrites one record. Negative entries are *appended*: `answerNegative` always mints a
  fresh identifier, and `currentEntries` picks the newest by `recordedAt`.
- **`instances`** — placements. High churn: every drag, every resize, every reminder change
  writes one. Some are created deliberately by the user in `plan.vue`; some are created
  *implicitly* by `occurrenceFor` in `index.vue` when you tick off a habit that was never
  planned.
- **`blocks`** — fixed commitments, and the only collection in the app with a **cross-record
  invariant**: `addBlock` refuses a block that overlaps an existing one.

### The choice: record-level last-writer-wins, on separate clocks, with a cascade sweep

Per-record last-writer-wins, with the whole record as the unit of merge — not per-field, not
a CRDT — plus four deliberate deviations that are where all the actual value is. The generic
part is boring on purpose; the specific part is where the data gets protected.

**Why the record and not the field.** This is not a general preference; it is forced by the
shapes in `habit.ts` and `planned-instance.ts`. A `Habit`'s fields are not independent:
`tracking: 'measured'` is meaningless without `measure`, `polarity: 'positive'` is meaningless
without `frequency`, and a `NegativeHabit` must have neither. Field-wise last-writer-wins can
produce a measured habit with no measure — a value that `createMeasuredHabit` cannot construct
and `parseBackup` would reject, sitting in storage, breaking a statistics screen far from
where it was created. The same coupling exists in `PlannedInstance`: `remindBefore` refuses a
reminder without a `startsAt`, `unschedule` drops both together, and `moveToDate` restamps
`periodKey` with `date`. Merge those fields independently and you get a reminder that can
never fire and an occurrence counted against the wrong period. The record is the smallest unit
guaranteed to be a legal domain value, because a legal domain value is exactly what one device
constructed.

**Why not a CRDT.** Four reasons, in descending order of how much they matter here.

1. It does not solve this app's actual conflicts. The two hard cases below — duplicate
   implicit occurrences, and delete-versus-write across a cascade — are *semantic* problems
   about what two records mean, not representational problems about how to merge two edits.
   Automerge would converge on both duplicates just as cheerfully as a hand-rolled merge does.
2. The metadata outgrows the data. `database.ts` chose IndexedDB explicitly because "this app
   accumulates one record per habit per day forever". An operation-history CRDT attaches
   per-field causal metadata to every one of those records, permanently, for a dataset whose
   fields are mostly written once.
3. It would be a rewrite, not an adapter. A CRDT document *is* the storage format; it would
   replace `StoredRecord<T>` and the whole of `collection.ts`. That is precisely the outcome
   the ports were built to avoid.
4. There is no collaborative text here. The only field where two people could meaningfully
   co-edit is a habit's name, which is at most eighty characters and belongs to one person.

**Which clock decides.** Not one clock — the distinction matters.

- `habits`, `blocks`, `instances`: the storage wrapper's `updatedAt`.
- `entries`: **`recordedAt`, the domain's own field, not `updatedAt`.** This is the important
  one. `currentEntries` and `latestEntryFor` already decide "which verdict stands" by
  `recordedAt`. If sync picked a winner by `updatedAt` while the domain picked a winner by
  `recordedAt`, the two would disagree the moment they diverge — and they do diverge, because
  `replaceAll` restamps `updatedAt` to now while preserving `recordedAt`. A device that
  restored a backup would push entries that sync considers newest and the domain ignores.
  Using the domain's clock keeps sync and the domain telling the same story.
- Ties: the greater identifier wins. Arbitrary, but deterministic and symmetric, which is what
  convergence needs. Note `latestEntryFor` currently breaks ties by list position, which is
  *not* symmetric across devices; a small existing weakness that sync would make visible.

### The four deviations

**(a) Delete is absorbing for `habits` and `blocks`.** A tombstone beats a concurrent update
regardless of timestamps. The reason is `deleteHabitCascade`: deleting a habit on device A
also tombstones every entry and every occurrence that habit owned. If B renamed the habit at a
later wall-clock time and the rename won, you would get a resurrected habit with its history
already destroyed — a habit that claims a hundred days of streak and shows none of them.
Losing a rename is cheap and visible. Resurrecting a gutted habit is expensive and silent. The
cost, stated plainly: an accidental delete on one device cannot be undone by editing on
another; the recovery path is a backup file, which is why stage 1 takes one automatically
before the first merge.

**(b) The cascade is re-asserted at merge time.** Deletion is not a record-level property in
this app, it is an invariant across three collections, and record-level merge does not preserve
invariants. Device A deletes a habit on Monday; device B, offline, records two entries against
it on Tuesday. Those entries have fresh UUIDs, so there is no tombstone anywhere that mentions
them, and record-level LWW keeps them forever: two invisible orphans, counting toward no
statistic, unreachable from any screen, undeletable. So after applying tombstones, the merge
sweeps: any entry or instance whose `habitId` points at a tombstoned habit is tombstoned too.
This is `deleteHabitCascade` re-run over the merged result, and it should share a pure
implementation with it.

**(c) Implicit occurrences get derived identifiers, not random ones.** This is the sharpest
concrete hazard in the codebase. `occurrenceFor` in `index.vue` creates a `PlannedInstance` on
the fly when you tick a habit that was never planned. Two devices, both offline, both ticking
Tuesday's meditation, mint two different UUIDs for the same real event. After sync the day
shows the habit twice, each copy with its own entry, and `countPlacedIn` reports two placements
against a weekly quota — so the app now believes you meditated twice as often as you did. No
conflict resolution can fix this, because at the record level there is no conflict: they are
two different records.

The fix is not in the merge, it is at the point of creation. An implicit occurrence should get
a **deterministic identifier derived from what makes it unique** — a UUIDv5 over the habit id,
the date and an ordinal — so two devices independently deciding "the first unplanned occurrence
of habit H on day D" mint the *same* UUID and merge into one record. Deliberate placements from
`plan.vue` keep random identifiers, so three genuinely planned gym sessions on Saturday stay
three. `identifier.ts`'s pattern does not constrain the version nibble, so a v5 UUID validates
today with no change, and the `uuid` package already in `package.json` exports v5. This costs
one new function in `identifier.ts` and one changed call site.

The equivalent question for entries answers itself: negative entries already work, because
appending with a fresh id plus `currentEntries` picking the newest by `recordedAt` *is* a
grow-only set with a deterministic read function. It is accidentally a CRDT and it needs
nothing. Positive entries reuse their id when correcting, which means two devices correcting
the same synced entry produce a genuine same-id conflict — and there LWW is simply right,
because both records describe the same event and the later answer is the one the user meant.

**(d) Overlapping blocks are accepted and surfaced, never rejected.** Two devices each add a
block that does not overlap anything they can see; merged, they overlap, and the invariant
`addBlock` guards is broken by data that never went through `addBlock`. The merge must not
refuse either record — refusing data at sync time is how sync loses data. It accepts both and
lets the block-time screen show the collision using `findConflicts`, which already exists, with
an inline "these overlap, pick one" prompt. Silently archiving the newer one is the tempting
alternative, and it is wrong: it deletes something the user typed, in the background, to
satisfy an invariant they never violated.

### Where naive last-writer-wins loses user data

1. **`replaceAll` is a data bomb.** The biggest one, and not subtle. `idb-repository.ts`'s
   `replaceAll` calls `collection.clear()`, which hard-wipes rows *and tombstones*, then
   re-puts everything with `updatedAt: now()`. To any sync engine that reads as: every record
   on this device was modified just now, and every record that used to exist and no longer does
   simply vanished leaving no trace. Sync that and one of two things happens. Either the mass
   "update" clobbers every newer edit on every other device, or — because there are no
   tombstones — no other device ever learns anything was deleted, so they push the whole old
   dataset back and the import is silently undone within seconds. Both are reachable today from
   `settings.vue`'s Import, Load demo data and Clear everything buttons. **Nothing else in this
   proposal matters if this is not handled first.**
2. **Delete-versus-continued-use**, covered by deviation (b): under naive LWW nothing is lost,
   but it becomes invisible and permanent, which is worse than lost.
3. **Archive versus retune.** A archives a habit; B changes it from three times a week to five.
   Whole-record LWW discards one intent entirely. Cheap, visible, recoverable by hand —
   acceptable.
4. **Rename versus recolour.** Same shape, cheaper still.
5. **Clock skew makes all of the above nondeterministic.** `updatedAt` is `Date.now()` on a
   phone. A device with a clock an hour fast wins every conflict against a correct one,
   forever, including ones it should lose. Mitigations in section 8.

---

## 2. Where the seam goes

### Do not decorate `Repository<T>`

The docblock in `repository.ts` says sync should be "a second adapter behind the same port",
and the instinct to wrap `Repository` in a syncing decorator is the obvious move. It is wrong
here, for a precise reason: **`Repository` deliberately cannot see the things sync needs.**
`all()` filters out `deletedAt`; `find()` returns `undefined` for a tombstoned row; nothing
exposes `updatedAt`. A sync engine built on `Repository` could never read a tombstone, which
means it could never do anything except resurrect deleted records — the exact failure
`database.ts` says the tombstones exist to prevent.

So sync sits *beside* `Repository`, not on top of it, over the same object stores.

### New port A: a change log, in `shared/domain/`

A second view over the same collection that speaks in versioned records rather than domain
values:

- `changedSince(watermark)` — every `StoredRecord<T>` touched since a point, tombstones
  included. The `updatedAt` index created in `database.ts` exists for exactly this and has
  never been read.
- `merge(records)` — applies incoming records **preserving their remote `updatedAt`**.

That second method is the one genuinely new capability. `collection.put` always stamps
`updatedAt: now()`. Applying a remote record through `put` would restamp it, making it look
locally-newer than it truly is, so the next round trip would push it back as a fresh change —
two devices ping-ponging the same record as "newest" forever. `collection.ts` therefore needs
an additive `merge`/`putRecord` path that writes a caller-supplied timestamp. Same store, same
key path, same index, so **no `DATABASE_VERSION` bump.**

### New port B: `SyncBackend`, in a new `modules/sync/`

```
pull()  -> a document, or nothing, plus a revision token
push(document, expectedRevision) -> written | stale
```

The revision token is compare-and-swap and it is not optional garnish: without it, two devices
that pull-merge-push concurrently silently discard one merge. For an HTTP backend it is an
ETag with `If-Match`. For a plain file it is mtime plus size, which is a *weak* token — and the
honest response to that weakness is architectural, not defensive: see backend A below.

### The merge is a pure function

`modules/sync/domain/merge.ts` takes two sets of versioned records per collection and returns
the merged set plus a summary of what changed. No IndexedDB, no network, no clock. This is
where every opinion from section 1 lives, and it is testable in exactly the style the codebase
already uses for `currentEntries`, `findConflicts` and `pendingReminders`.

For that function to live in the domain, the versioned-record type has to be reachable from the
domain. Today `StoredRecord<T>` is declared in `shared/infrastructure/idb/database.ts`. Move
the type to `shared/domain/` and have the IDB layer import it. That is a rename-scale change
and it reflects the truth — "this record's version and whether it is dead" was always a domain
concept, which is why it was designed before it was needed — but it is the one place this
proposal bends the existing structure, and it is arguable.

### What must not change

- **`Repository<T>`.** No new methods, no changed semantics. Every page and every
  `@pinia/colada` composable keeps reading through it and never learns sync exists.
- **The domain entities.** `Habit`, `HabitEntry`, `PlannedInstance` and `BlockTime` gain no
  `deviceId`, no `rev`, no `dirty` flag. All sync metadata stays in the wrapper. This is the
  whole reason `collection.ts` keeps "the storage concerns in the wrapper around them rather
  than mixed in".
- **`Dataset` and `parseBackup`.** A backup stays a human-restorable snapshot. The sync
  document is a different format carrying tombstones and timestamps, and must not be squeezed
  into `BACKUP_VERSION`.
- **`staleTime: 0` and the four query keys.** After a merge lands, the sync layer invalidates
  `HABITS_KEY`, `ENTRIES_KEY`, `INSTANCES_KEY` and `BLOCKS_KEY` — exactly what
  `useReplaceDataset` already does — and every screen redraws for free.

### Composition

`createPersistence` keeps returning `Persistence` unchanged and additionally exposes the
change-log handles over the same `IDBDatabase`. Backend selection does *not* belong in
`platform-context.ts`: that file answers "what can this device do", and it answers it once at
startup, correctly. Which backend to sync with is a *user preference* that can change at
runtime, so it belongs in a `core/sync-context.ts` reading a stored setting, with
`platform-context` only supplying the capabilities a backend needs.

---

## 3. Backend options

### A. A file in a folder the user chose, carried by Dropbox, Drive or Syncthing

The Obsidian answer, and the one to ship.

*Cost:* zero, permanently, for the user and for the project. *Privacy:* the best available —
with end-to-end encryption the provider stores an opaque blob and there is no operator to
trust, because there is no operator. *Conflict risk:* nominally the highest, because the
transport knows nothing about our merge and resolves simultaneous writes by making
`file (conflicted copy).json`.

That risk is mostly designable away: **one file per device.** `some-kaisen.<deviceId>.sync` is
written only by the device that owns it, and every device reads all the siblings in the folder
and merges them locally. No two devices ever write the same file, so there are no write-write
conflicts for the provider to mangle, and the weak mtime revision token stops mattering. The
folder becomes a set of single-writer logs. This costs a linear scan of N small files on each
sync, which for N of two or three is free.

*Code:* the least protocol work of the three, the most platform work. The awkward part is
Android. The current `capacitor-file-exchange.ts` explicitly and correctly avoids storage
permissions by writing to `Directory.Cache` and handing the file to the share sheet; that trick
does not extend to "keep writing into this folder forever". Persisting a user-chosen folder
needs the Storage Access Framework and a persisted URI permission, which `@capacitor/filesystem`
is not believed to expose. And the transport story on Android is worse than it sounds:
Dropbox's Android app does not sync arbitrary folders and neither does Drive. **On Android this
backend realistically means Syncthing.** On desktop browsers the File System Access API gives a
persistable directory handle, but Firefox and Safari do not implement it. This backend is
excellent on Chromium desktop, good on Android with Syncthing, and unavailable elsewhere — and
the setup screen should say so rather than fail later.

### B. A self-hosted endpoint — and specifically, WebDAV

*Cost:* the user's, and they have already chosen to pay it. *Privacy:* good; with end-to-end
encryption the server is a dumb blob store that never sees a key. *Conflict risk:* the lowest
of the three, because ETag plus `If-Match` is real compare-and-swap, which is the one primitive
that makes convergence provable rather than merely likely.

Prefer **WebDAV over a bespoke endpoint.** Nextcloud, Synology and most self-host stacks speak
it already, it has ETags, and it requires writing and maintaining zero server code — a bespoke
endpoint means a second artefact, a second release cadence and a second set of docs, in exchange
for a protocol that is not better. *Code:* a WebDAV client is a few hundred lines of `fetch`,
plus credentials handling. The practical obstacles are CORS in a browser tab (the Android
WebView can go around it with a native HTTP bridge) and what to do about self-signed
certificates on a LAN.

### C. A hosted service

*Cost:* real money and, more to the point, a real obligation. *Privacy:* the worst by
construction, and acceptable only if it is end-to-end encrypted from the first commit with no
server-side key escrow — which then removes most of the reason a hosted service is easier for
anyone. *Conflict risk:* the lowest, since a server can arbitrate. *Code:* more than the other
two combined and then some: accounts, billing, abuse, backups, erasure requests, and a support
queue for people who lost their passphrase.

**Recommendation: do not build it.** Not "later" as a polite deferral — choosing this is
choosing to run a business that stores other people's relapse logs, and that is not a technical
decision to slide in behind a feature flag. If it ever happens, it should happen because users
asked and someone decided to take on the duty of care.

**Ship order: A, then B, and C probably never.**

---

## 4. What the user sees

**Off by default, and invisible.** Settings' Data section currently says "Everything lives on
this device only." That sentence is a promise. While sync is off it stays exactly as it is,
with one quiet row added below the backup card: *Sync — Off*. No banner, no badge, no nudge.

**Enabling** is three steps, in this order, and the order is deliberate:

1. *Where.* A short, honest description of each backend, including what it cannot do here —
   "Needs Syncthing or a synced folder; not available in this browser" is more use than
   discovering it after setup.
2. *A passphrase.* Before any data moves, not after. With an unambiguous warning that there is
   no recovery, and a recovery phrase offered to write down.
3. *The first sync.*

**The first sync against an existing device is the dangerous moment**, and it gets special
rules.

- **First contact is union-only. Deletions are not applied.** A tombstone means "this record
  existed and was deliberately removed", and that is only meaningful between devices that
  already share history. On first contact, a record missing from the other side means nothing
  at all — it means you have never spoken. So the first merge adds, resolves overlapping ids by
  timestamp, and deletes nothing, ever.
- **It is previewed, not performed.** "This adds 3 habits and 214 recorded days, and updates 2
  habits. Nothing will be removed." Then a confirm, in the same voice as the existing restore
  dialog.
- **A local backup file is written first**, automatically, through the export path that already
  exists. It costs one file and it is the only undo anybody will ever have.

**Status** is one line: *Last synced 14 minutes ago*, and a *Sync now*. Sync runs in the
background — on launch, and debounced after writes — and never blocks a screen. If the device
is offline the line says so and how many local changes are waiting. There is no progress bar; a
habit tracker's dataset syncs faster than a bar can render.

**Errors** are named, in the voice `data-transfer.ts` already uses. A wrong passphrase says the
file cannot be opened and that there is no way to recover it. A document from a newer app
version says so and refuses — and, critically, refuses *without pushing*, because an old device
that fails to read a new document and then writes its own would downgrade every other device. A
backend that is unreachable is not an error at all, just a status. A clock that looks badly
wrong gets a warning, because it will silently corrupt conflict resolution. In all cases: **a
sync failure never blocks local use and never leaves a half-applied merge.** Partial
application is safe by construction, because LWW with preserved timestamps is idempotent and
commutative — re-running an interrupted merge converges. This is a real and underrated benefit
of the model.

**Disabling** is one button and a plain sentence: *Turn off sync. Everything stays on this
device.* Optionally, delete the copy on the backend. Records that arrived from other devices
stay, because they are yours and this device is now the only place some of them live. Turning
sync off must never present a confirm dialog about losing data, because there is none to lose —
and if it ever needs one, the design is wrong.

---

## 5. Encryption and privacy

Take the threat model seriously and it is not a nation state. It is a partner with your
unlocked phone, a parent, an employer's device management, a cloud provider's automated content
scanning, and a breach of whatever backend in five years. A row reading
`Smoking — relapsed — 2026-04-12` is a disclosure people are harmed by, in custody hearings and
job interviews and relationships. And the *names* leak more than the outcomes: "Smoking",
"Drinking", "Porn", "Lexapro" are the payload.

**End-to-end encryption is in stage one, not added later.** Retrofitting it means a period
during which real relapse logs sat in plaintext in someone's Dropbox, and there is no way to
un-sit them.

**Concretely.** The whole document is encrypted, not selected fields — the structure and the
names are the sensitive part and per-field encryption leaves the shape visible. Passphrase →
Argon2id (PBKDF2-SHA256 with a high iteration count if avoiding a WASM dependency is worth
more than the memory-hardness) with a random salt, stored in the file header in plaintext,
which is what salts are for. Then AES-256-GCM through WebCrypto. The derived key lives in
memory; on Android the passphrase may go into the platform keystore through a secure-storage
plugin. **Never localStorage** — `preferences-store.ts` uses it correctly for display settings
and it must not acquire a second job.

**A constraint the codebase already documented, which bites here.** `identifier.ts` explains at
length that `crypto.randomUUID` was avoided because it needs a secure context, and this app is
developed over `http://192.168.1.18:5173` on a real handset. `crypto.subtle` has the same
restriction, and there is no library fallback worth having, because the answer to "WebCrypto is
unavailable" is never "implement AES in JavaScript". So: **sync requires a secure context, and
the setup screen is disabled with a clear explanation when there isn't one.** Production is
fine — Capacitor serves Android from `https://localhost` by default — but the LAN development
workflow loses sync, and that should be a known cost rather than a surprise. Verify the
Capacitor scheme before relying on it.

**No escrow, no recovery, no back door.** A forgotten passphrase means the remote copy is gone;
the local data is untouched. Say this at setup, require an acknowledgement, offer a written
recovery phrase.

**What still leaks with perfect encryption**, because pretending otherwise is worse than the
leak: document size correlates with how many habits and how many months you have; write
frequency correlates with when you open the app, which for a relapse tracker is itself a
signal; the file name and the number of device files reveal that this app is in use at all.
Padding to bucketed sizes is a few lines and worth doing. A neutral file name is free — not
`habits.json`.

**One existing hole, adjacent and worth noting:** the current export writes plaintext JSON to
the share sheet. That is defensible for a deliberate backup, but once the encryption envelope
exists, an encrypted export costs almost nothing and should be offered.

---

## 6. Migration and versioning

**Three version numbers, kept apart, because they change for different reasons.**

- `DATABASE_VERSION` — the IndexedDB schema. Unchanged by this proposal: the change log reuses
  the existing stores and the existing `updatedAt` index.
- `BACKUP_VERSION` — the backup file. Unchanged, and **not** reused for sync. Overloading it
  would tie an internal protocol change to the format of files users have already saved.
- A new `SYNC_PROTOCOL_VERSION` — the sync document.

The sync document header, in clear text alongside the encrypted body: format marker, protocol
version, entity-shape version, device id, written-at. Everything a device needs to decide
whether it can safely participate, without decrypting.

**The refusal rule.** A device that meets a protocol version above its own refuses to merge and
says so, in the same register as `parseBackup` today: *"That was written by a newer version of
the app."* And it must refuse **without pushing**, or the older device overwrites the newer
document and drags everyone back. This is the single most commonly botched line in a sync
implementation.

**Entity-shape migration, and the rule that follows from it.** `parseBackup` rebuilds every
record through the domain constructors and drops anything it does not recognise. That is exactly
right for an untrusted backup file and exactly wrong for sync: a round trip through an older
device would silently strip a new field from every record it touched, permanently, across the
whole fleet. So sync gets a different rule, and it should be written down as a rule: **validate
what you use, forward what you don't.** A record the merge does not choose as a winner is
forwarded byte-for-byte. A record it does choose is validated on the fields this version
understands, with unknown fields carried through untouched.

**Existing users migrate for free.** A device that has been running for a year has records with
arbitrary `updatedAt` values, no device id and no tombstone history. None of that matters,
because first contact is union-only and does not consult tombstones.

---

## 7. Staging

### Stage 0 — make the local store honest

Three changes worth making whether or not sync ever ships, and without which merge cannot be
correct:

1. `replaceAll` either produces real tombstones or is made unreachable while sync is on.
   Section 1 explains why this is not negotiable.
2. `occurrenceFor` derives its identifier instead of minting a random one.
3. `updatedAt` becomes locally monotonic — `max(Date.now(), lastIssued + 1)` — so a clock that
   jumps backwards cannot make an old edit outrank a new one on the same device.

### Stage 1 — manual reconcile, no backend at all

A "Merge with another device" action in Settings that writes an encrypted sync document through
the **existing** `FileExchange` port, and reads one back through the existing picker. No new
platform code, no background work, no scheduling, no folder permissions.

This looks modest and it is not. It ships the entire merge engine, the document format and the
encryption envelope, exercised against real data, and it gives the user something the app
genuinely cannot do today: **import currently replaces, it does not merge.** Two devices can
already be reconciled without either losing anything. If the merge is wrong, this is where it is
cheap to find out.

### Stage 2 — the folder backend

The `SyncBackend` port, one file per device, automatic on launch and debounced after writes,
watermarks, status UI. Same document, same merge, different transport.

### Stage 3 — WebDAV

Compare-and-swap against a single shared document, for people who self-host.

### Deliberately deferred, with reasons

- **Real-time propagation.** Habit tracking is not collaborative. A few minutes of lag is
  invisible; the engineering to remove it is not.
- **Per-field merge and CRDTs.** Revisit only if real reports of lost edits appear, and only
  for a specific field that is actually losing them.
- **Partial or selective sync.** A decade of five habits is on the order of twenty thousand
  records — a few megabytes of JSON, a few hundred kilobytes compressed. Whole-document sync is
  fine for years. It should be *measured*, and the threshold at which it stops being fine
  should be written down when it is.
- **Syncing preferences.** Theme and clock live in localStorage for a documented reason, and
  per-device display settings arguably *should* differ — a phone in dark and a laptop in light
  is a feature.
- **Sharing, multi-user, anything social.**
- **A hosted service.**
- **Merge history and undo.** Mitigated in stage 1 by the automatic pre-merge backup, which is
  most of the value for a fraction of the work.

---

## 8. Risks and open questions

Answer these before writing code, roughly in order of how much they could change the design.

1. **`replaceAll`.** What should Import and Clear everything mean on a synced device? "Make
   this the truth everywhere" and "let me look at an old file" are both plausible readings of
   the same gesture, and they have opposite consequences. This is a product decision, not a
   technical one, and it blocks everything.
2. **Clock skew.** Locally monotonic timestamps fix one device; they do nothing across devices.
   The proper answer is a hybrid logical clock, and it can be made to fit inside the existing
   `updatedAt: number` with no format change — wall-clock milliseconds shifted left with a small
   counter in the low bits. With a 10-bit counter the arithmetic stays inside
   `Number.MAX_SAFE_INTEGER` until roughly 2248, which is comfortable; with 12 bits it fails in
   2039, which is not. This needs a spike, and the packing may not be worth the cleverness
   versus simply detecting and warning about a bad clock in stage 1.
3. **Android folder access.** Can a user-chosen folder URI be persisted across restarts with the
   current plugin set, or does this need native code? Believed to need SAF, which
   `@capacitor/filesystem` does not appear to cover. Answer this before backend A is promised
   on Android.
4. **Secure context on device.** Confirm the Capacitor Android WebView really serves over
   `https://localhost` so `crypto.subtle` exists, and confirm that losing sync in the LAN
   development workflow is acceptable.
5. **Is "delete always wins" right?** Argued from the cascade, but it is the choice most likely
   to produce an angry bug report, and a real user's reaction is worth having before committing.
6. **How many devices, honestly?** If the answer is "a phone and one laptop", a great deal of
   the generality above can be dropped and the file-per-device design becomes trivially correct.
7. **Will there ever be a server?** That single answer decides whether the document format needs
   to be compare-and-swap-shaped from day one or can stay file-shaped.
8. **Are there other places minting identifiers for things that are conceptually unique?** One
   was found (`occurrenceFor`). `plan.vue`'s drag-created instance is correctly random. This
   deserves a deliberate audit.
9. **Testing two devices.** `fake-indexeddb` plus the injectable database name in `openDatabase`
   should be enough to run two independent devices in one test process and assert convergence —
   the name was made injectable for test isolation, and that makes a genuine two-device merge
   test possible with no new infrastructure. Worth confirming early, because if it works, every
   claim in section 1 becomes a test.
10. **Real dataset size after a year.** Measure before committing to whole-document sync.

---

## Summary

**Conflict model:** per-record last-writer-wins — the record, not the field, because these
entities have internal invariants (`tracking`/`measure`, `polarity`/`frequency`,
`startsAt`/`reminderMinutesBefore`) that field-level merge would break into states the
constructors refuse to build. Entries resolve on `recordedAt`, the domain's own clock, so sync
and `currentEntries` cannot disagree. Four deviations carry the real weight: deletes are
absorbing for habits and blocks; the delete cascade is re-asserted after every merge; implicitly
created occurrences get derived UUIDv5 identifiers so two devices ticking the same unplanned
habit converge on one record instead of inflating the quota; and overlapping blocks are accepted
and surfaced rather than rejected. No CRDT — it would not solve either of this app's two real
problems, both of which are semantic rather than representational, and it would replace the
storage layer rather than plug into it.

**Backend to ship first:** none, in the literal sense — stage 1 is a manual "merge with another
device" through the `FileExchange` port that already exists, which ships the whole merge engine
and encryption envelope with zero platform work and already does something the app cannot do
today (import replaces; it does not merge). The first *automatic* backend is a file per device
in a user-chosen folder carried by Syncthing or a synced folder, one writer per file so there
are no write-write conflicts for the transport to mangle. WebDAV second. A hosted service:
recommended against entirely.

**Biggest risk:** `replaceAll` in `idb-repository.ts`. It calls `clear()`, destroying tombstones,
then rewrites every record with a fresh `updatedAt` — so to any sync engine, Import / Load demo
data / Clear everything read as "every record here changed just now, and everything that
disappeared left no trace". Sync that and you either clobber every other device's newer edits or
have the import silently undone within seconds. It is reachable from three buttons in
`settings.vue` today, and no amount of correctness elsewhere survives it.
