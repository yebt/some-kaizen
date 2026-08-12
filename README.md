# Some Kaisen

A mobile-first habit tracker that gives habits a place in the day rather than a checkbox in
a list. Fully offline, stored on the device, packaged for Android with Capacitor.

## What it does

- **Three kinds of habit**, modelled as three separate shapes so an impossible combination
  cannot be represented.
  - _Did it_ — binary. You meditated or you did not.
  - _Measured_ — carries a unit, a minimum and a goal. Reaching the minimum grades as a
    partial day, because a day where you drank most of your water is not the same as a day
    where you drank none.
  - _Quitting_ — never planned and never performed. Each finished day is judged the
    following morning, which is the only moment the answer is actually known.
- **Planning in two gestures.** Drag an occurrence onto a day in the weekly board, then drag
  it onto an hour in the day timeline. An occurrence that never gets the second gesture is
  valid and simply happens sometime that day. Once placed, a grip on the card's lower edge
  drags its length; a tap opens the same lengths as buttons, for anyone not using a finger.
- **Block time** — sleep, work, and anything else immovable. Blocks may never overlap each
  other; habits may overlap them freely, because reading during a commute is a real plan.
- **Statistics** per habit and overall, including a six-month heatmap.
- **Reminders** on scheduled occurrences, delivered by the system on Android.
- **Backup** to a single JSON file. Importing one *merges* rather than replaces: a backup is
  usually the other half of your data, so it brings what is missing, keeps what is here when
  the two disagree, and shows every collision before writing anything.

## Running it

```sh
bun install
bun run dev          # http://localhost:5173
bun run dev:phone    # also on the local network, for testing on a real handset
```

Opening the app over a plain LAN address is not a secure context, so anything relying on one
will not work there. That is a real constraint rather than a quirk: it is why identifiers are
minted through `uuid` instead of `crypto.randomUUID`, which does not exist outside a secure
context and broke every screen the first time this was tried on a phone.

## Checks

```sh
bun run test:unit    # vitest
bun run type-check   # vue-tsc
bun run lint         # oxlint and eslint
```

Run the type check separately from the tests. Vitest transpiles without checking types, so a
green test run has already hidden real type errors here more than once.

## Android

Requires the Android SDK and a JDK. Both `JAVA_HOME` and `ANDROID_SDK_ROOT` must be set; the
build is known to work on JDK 21 and JDK 24.

```sh
bun run android:apk       # build the web app, sync, and assemble a debug APK
bun run android:install   # adb install the result
```

The app asks for notification permission the first time a reminder is actually set, never on
launch, and asks for no storage permission at all: exporting writes into the app's own cache
directory and hands the file to the system share sheet, while importing uses a file input,
which already opens the system document picker inside the WebView.

## How it is put together

Hexagonal, with each feature owning its own slice.

```
src/
  shared/domain/       value objects: dates, times, colours, identifiers
  shared/ui/           components, gestures, feedback
  shared/infrastructure/idb/
  modules/<feature>/
    domain/            pure rules, no framework
    application/       queries and mutations over the ports
    infrastructure/    adapters
    ui/                components owned by the feature
  core/                composition root: persistence, platform, router
  pages/               file-based routes
```

The domain never learns that IndexedDB, Vue or Capacitor exist. Only `src/core` knows both a
port and its adapter, which is what makes the planned sync a second adapter rather than a
rewrite of everything that touches data.

### Decisions worth knowing before changing things

**Dates are `YYYY-MM-DD`, not `Date`.** A habit is performed on a day the user lived, not at
an instant on a global timeline. "Did I drink my water on Tuesday" must stay Tuesday whether
it was logged at 07:00 or 23:59, and must survive a daylight saving change. All arithmetic
runs through UTC internally, where days are exactly 24 hours long.

**Times are minutes from midnight, and a span is a start plus a duration.** Sleep from 23:00
to 07:00 written as two clock times looks like a backwards, empty range. Written as a
duration it stays unambiguous, and overlap is computed by flattening each span onto the days
it actually covers — which is how Sunday night correctly collides with a Monday morning
alarm.

**Occurrences are stamped with a period key.** "Twice a week" only means something once you
fix which week. Counting by key rather than by scanning dates keeps the week spanning New
Year as one week instead of two half quotas.

**Entries belong to an occurrence and carry `recordedAt`.** Storage returns rows keyed by
identifier, which for a UUID is random order, so "the last one in the list" is not "the last
one written". A correction replaces the answer rather than stacking beside it.

**Deletes leave tombstones.** A deletion that leaves no trace is indistinguishable from a
record another device has never seen, so the first sync would resurrect everything you ever
deleted.

**Backups are rebuilt through the domain's own constructors.** An imported file is untrusted
and is rejected whole rather than trusted into storage, where a single bad field would
surface later as a broken screen far from the import.

**Foreground colour is computed, not chosen.** A fixed white label reads perfectly on a deep
blue and turns invisible on a pale yellow, so the ink with the higher contrast wins. Patterns
exist alongside colour because colour alone excludes anyone who cannot separate red from
green, and disappears in greyscale.

## Licence

Private project.
