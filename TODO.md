# TODO

What is agreed and not yet built. Reasoning lives in `docs/proposals/`; this is the list.

## Next up

### Routines
Named, ordered groups of habits with their own progress count — `Morning [3/4]`,
`Deep Work [1/4]`, `Wind Down [1/3]`.

A routine is shaped like block time already is: a named stretch of the day. It is also the
only thing that makes a fourteen-habit day readable, since today that is a flat list of
fourteen rows.

- [x] Decided: a routine **owns** its habits. Tagging only looked necessary because *Health*
      is a category, not a routine — and categories are free to cut across later
- [x] `Routine` in the habits domain, with its own store, backup round trip and merge rules
- [x] Grouped rendering on Today, with a per-routine count, and no headings until a day has
      actually been arranged
- [x] A screen to create and fill one — list, new, edit, with archive and removal
- [x] Grouped rendering on the day timeline — in the tray and the slot dialog, which is where
      an arrangement can show on a screen whose other axis is the clock
- [x] Optional anchor time, so a routine can say when it usually happens — it orders the day
      and labels the heading, and is deliberately *not* handed down to the habits inside, which
      would stack them all on one minute of the ruler. Spreading them needs durations, which is
      the routine builder's job and where this anchor becomes its start time
- [ ] **A library of routine presets to import from.** Not a store in the paid sense: a set of
      routines somebody can start from instead of facing an empty form — *20/20/20*, *the calm
      15*, *the focused 45*, *wind down*. Importing one creates the routine **and the habits it
      needs**, which is the part that makes it worth doing and also the part that needs care:
      a preset must merge with what already exists rather than duplicating a "Meditate" that
      is already there. Ships bundled with the app first, since offline-first means a library
      that only works online is a library that mostly does not work. A shared or downloadable
      one can come later, and would need a way to read a routine someone else wrote without
      trusting it

### A habit's usual hour
The question this answers: today every occurrence is placed on its own day, so a habit that
happens at 07:00 every morning has to be dropped onto 07:00 every morning.

- [x] An optional `usualTime` on a habit, used as the start whenever an occurrence is created
      for it — so placing it is a correction rather than a chore
- [x] The day draws a duty at that hour before any occurrence exists, and writes nothing until
      something is actually changed about it
- [x] Dragging a card on one day changes that day only; changing the usual hour is a separate,
      explicit act on the habit itself. Editing every future day from a gesture meant for one
      of them is how a planner starts lying about the past

### Carrying a day's plan forward
The design, from the session it came out of: a day's arrangement is a state that replicates to
the next day, and any day can pull one in — "bring the last routine" or "bring a specific
day's". The automatic pick has a priority order:

1. the same weekday last week (last Tuesday for a Tuesday),
2. failing that, the previous day,
3. in both cases filtered to the habits that actually apply to the target day.

- [ ] Habits that name their weekdays make this interesting: pulling Monday's plan onto a
      Tuesday must drop the Monday-only ones rather than schedule them wrongly
- [ ] Pulling a plan is an explicit act with a preview, never a silent copy — a planner that
      fills a day on its own is one you stop trusting about the past

### Gesture bugs jsdom cannot see

The drawer freeze — holding the day still while a card is carried — guards against a refetch
removing the element the finger has hold of. It cannot be tested here: jsdom has no pointer
capture, so an event dispatched on a detached node still runs its listeners and any test for
it passes either way.

- [x] The harness itself: Playwright against the **built** app, Chromium and Firefox, one
      browser context per test so each starts on an empty database. Three things it settled
      on the way in. The dev server is the wrong target — it serves every source file at its
      own URL, and a route file called `[id]/index.vue` becomes a URL with brackets that
      Firefox refuses to load, which is a difference in the tooling rather than in the
      product. Reusing a running server is worse than slow: it skips the build and quietly
      tests an older bundle, which it did, and a reintroduced defect passed. And a production
      build strips Vue's warnings, so "fail on a console warning" catches nothing there —
      assert the control is on the screen instead
- [ ] A handful of real-browser gesture tests on top of it. The cases worth the setup are
      exactly the ones that keep breaking: carrying a chip out of the drawer, and a card
      whose list refetches mid-drag
- [ ] Drive them with real touch, not a mouse. A hold that works with a pointer can still be
      stolen by a scroller on a finger, and CDP's synthetic touch events proved too unreliable
      here to tell the difference
- [ ] Run them in Firefox as well as Chromium. A layout bug reported there could not be
      reproduced in a scripted Chromium *or* Firefox — the difference was in the page around
      the component, which only a real page reproduces

### On a gesture library

Raised as a preference and worth answering rather than filing. The repeated timeline
breakages were not gesture recognition — press, axis lock, cancellation and the edge scroll
have thirty-two passing tests and none of them regressed. Every one of the failures was
**geometry**: where the ghost is drawn, and which of two expressions decides where a card
lands. `interact.js` does not know what a minute is on our ruler, so it would not have
decided either of those.

What was actually missing was a test comparing what the screen promises with what is written.
There is one now, and it fails on exactly the reported bug when the fix is undone.

- [ ] Revisit if the next round of gesture defects is recognition rather than geometry —
      multi-touch, momentum, or nested scrollers would each be a real argument for a library

### Reported and not yet fixed

Raised in one session and deliberately not attempted in it, because several of them were
introduced by fixing something else in the same sitting.

**Swiping a card off the ruler, right to left, should unschedule it.** Now reachable two
other ways — the sheet on the card, and the drop strip that turns red — so this is a shortcut
rather than the only route, and it can wait until the drag work has settled.

### Routine builder
A start time plus a list of steps with durations, cascading the clock forward. This is
`scheduleAt` + `resize` applied down a list, so it is not a new feature — it is a **third way
to fill the day we already model**, next to dragging onto an hour and typing an exact time.
For a morning routine it is by far the fastest of the three.

- [x] Builder screen: start time, steps, durations, live cascading times. Reached from the
      routine list, seeded from the routine's own anchor hour, and it builds onto any day
      rather than only today
- [x] Writes real occurrences, not a separate kind of record — and each carries the identity
      the day would have derived anyway, so a build is an edit rather than a duplication and
      the day never claims a habit is owed twice
- [x] `usualDurationMinutes` on a habit, so the second build opens already filled in. A length
      is a fact about the habit, not about one day, which is why the builder writes it back
      there rather than only onto the occurrence
- [x] A step that would *begin* after midnight is held back and named rather than folded onto
      the clock, where it would be drawn at the top of the same day, hours before the step it
      follows. A step that merely *ends* after midnight is fine and always was
- [ ] A way in from the day screen itself — today you build from the routine list, which is
      the wrong place to be standing when you are looking at a day

### Presets and categories
- [ ] Preset routines to start from — see the routine preset library under **Routines** above,
      which is where that item now lives
- [ ] A browsable, categorised habit-ideas list (health, focus, home, mind…)
- [ ] Reuse the same list in the app's empty state: a first habit is the hardest one
- [ ] Categories earn their keep **only if statistics group by them**. Otherwise it is a
      taxonomy to maintain that answers no question

### Habit title and description
- [ ] Optional `description` on a habit, shown under the name where there is room
- [ ] Their `// comment` voice is worth borrowing — ours already reads that way in code

### Icons
- [ ] An icon per habit, alongside the colour and pattern it already has
- [ ] Drawn set, one stroke weight. Not emoji: an emoji is a different typeface on every
      platform and carries a skin tone and a gender nobody chose
- [ ] Colour and pattern stay. Pattern is what survives greyscale and colour blindness

### Stats worth reading
- [ ] Data windows on every statistic: `[7d] [30d] [90d] [365d] [all] [custom]`
- [ ] Day-of-week breakdown — *"best day: fr (88%), worst day: tu (41%)"*. The most
      actionable number in init.Habits, and we already store everything it needs
- [ ] Per-habit summary block: schedule, current and best streak, days tracked

### Notes on an entry — done
- [x] Optional `note`, trimmed, capped, and absent rather than empty
- [x] Written from the amount dialog, which had already interrupted you; never behind the
      swipe, which exists so that marking a day costs nothing
- [x] Read back on the habit's own page, newest first
- [ ] A way in for a "did it" habit, which today has no dialog to hang it off
- [ ] A way in for a negative habit's verdict, same reason

### Challenges
- [ ] A programme container: fixed length, fixed daily task set, all-or-nothing days
- [ ] 75 Hard as the first one, restart-on-miss included
- [ ] Modelled **outside** the habit model. Its restart rule contradicts everything we
      believe about days accumulating, and that is fine for something opted into

## Later

### Sync
Fully specified in `docs/proposals/sync.md`; nothing built. Before any of it:

- [x] Stage 0 is done: `updatedAt` is monotonic and seeded from disk, `replaceAll` buries
      what it removes instead of wiping it, tombstones no longer carry the value they buried,
      and `occurrenceFor` already derived its identifier
- [ ] Then stage 1 onwards from the proposal
- [ ] The 6-character pairing code from init.Habits is worth stealing as **UX only**. Theirs
      addresses unauthenticated storage directly, so guessing a code reads someone's history

### Web tools on the landing
Single-purpose, no account, local storage, export as PNG / JSON / CSV. They can import our
domain directly — it is plain TypeScript with no framework in it — so they are a second
consumer rather than a reimplementation.

- [ ] Heatmap generator
- [ ] Habit ideas
- [ ] Routine planner (falls out of the builder above)
- [ ] 75 Hard tracker (needs challenges)

### Health data as a value source
- [ ] A `source` on a measured habit: `manual | health`
- [ ] HealthKit and Health Connect plugins, permissions, background read
- [ ] Re-read the landing's privacy claim word by word first. It currently says, in large
      type, that nothing is ever sent anywhere

### Housekeeping
- [ ] Post the prepared comment to `Gentleman-Programming/gentle-ai#2943` — blocked on `gh`
      not being installed. Text is in `scratchpad/issue-2943-comment.md`
- [ ] Google Calendar integration, deferred from the original brief

## Decided against

- **Terminal mode.** Studied in `docs/proposals/init-habits-study.md` and dropped. The
  keyboard map is the real prize and it exists only where there is a keyboard.
- **XP, levels, badges, tiers.** An extrinsic reward attached to something you already wanted
  reduces how much you want it. It also breaks entirely on quitting habits, where losing
  points for a relapse makes lying to the app the rational move.
- **Shields / streak freezes.** A streak is a measurement, and the moment it can be repaired
  it measures nothing. The honest version of the same kindness is a separate, visible number:
  *longest run, allowing one miss*.
- **Timers.** Deferred rather than refused — no clear need yet.
- **Accounts, plans, pro tiers.**
