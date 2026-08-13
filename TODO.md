# TODO

What is agreed and not yet built. Reasoning lives in `docs/proposals/`; this is the list.

## Next up

### Routines
Named, ordered groups of habits with their own progress count — `Morning [3/4]`,
`Deep Work [1/4]`, `Wind Down [1/3]`.

A routine is shaped like block time already is: a named stretch of the day. It is also the
only thing that makes a fourteen-habit day readable, since today that is a flat list of
fourteen rows.

- [ ] `Routine` in the habits domain: name, ordered habit ids, optional anchor time
- [ ] Grouped rendering on Today and on the day timeline
- [ ] Per-routine completion count
- [ ] Decide: does a routine **own** its habits, or **tag** them? Owning is simpler; tagging
      lets one habit sit in both *Morning* and *Health* and costs a join everywhere

### A habit's usual hour
The question this answers: today every occurrence is placed on its own day, so a habit that
happens at 07:00 every morning has to be dropped onto 07:00 every morning.

- [ ] An optional `usualTime` on a habit, used as the start whenever an occurrence is created
      for it — so placing it is a correction rather than a chore
- [ ] Dragging a card on one day changes that day only; changing the usual hour is a separate,
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

**Refusing an impossible swipe does not work.** Marking done twice and taking back a day
nobody recorded both still go through, and the shake is never seen. The condition reads
`row.outcome`, which is not `undefined` as often as the code assumes.

**The drawer pill is invisible.** "3 habits need an hour" sits at `z-30`, the tab bar at
`z-40`. It is behind it.

**Finished habits want an accordion, not a counter.** A row below the outstanding ones —
"4 done" — that opens them in place, rather than a number in the header that toggles the whole
list. The list should be the work left, with the finished ones reachable directly underneath.

**Swiping a card off the ruler, right to left, should unschedule it.** Now reachable two
other ways — the sheet on the card, and the drop strip that turns red — so this is a shortcut
rather than the only route, and it can wait until the drag work has settled.

**Feel.** A detent that can be felt: a short haptic tick as the day strip passes each valid
day, and on the timeline as a card crosses each snap step. Capacitor's Haptics plugin covers
it; the open question is how much of the app should speak that language rather than just this
one control.

### The day strip should scroll, not step
- [ ] Follow the finger continuously rather than committing a whole day per swipe, and settle
      onto a valid day when released — the camera zoom wheel, not a pager. Half a day must
      never be left sitting at either edge
- [ ] The current version commits one day per gesture, which is a detent without the travel:
      the strip does not move while the finger does

### Routine builder
A start time plus a list of steps with durations, cascading the clock forward. This is
`scheduleAt` + `resize` applied down a list, so it is not a new feature — it is a **third way
to fill the day we already model**, next to dragging onto an hour and typing an exact time.
For a morning routine it is by far the fastest of the three.

- [ ] Builder screen: wake time, steps, durations, live cascading times
- [ ] Writes real occurrences, not a separate kind of record

### Presets and categories
- [ ] Preset routines to start from — *20/20/20*, *the calm 15*, *the focused 45*
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
