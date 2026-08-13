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

### Notes on an entry
The one outstanding item from the ANOTHER.md review.

- [ ] Optional `note` on a positive entry, written when it is recorded
- [ ] It is the only datum no statistic can produce: *why* a day went the way it did

### Challenges
- [ ] A programme container: fixed length, fixed daily task set, all-or-nothing days
- [ ] 75 Hard as the first one, restart-on-miss included
- [ ] Modelled **outside** the habit model. Its restart rule contradicts everything we
      believe about days accumulating, and that is fine for something opted into

## Later

### Sync
Fully specified in `docs/proposals/sync.md`; nothing built. Before any of it:

- [ ] Make `updatedAt` locally monotonic. A clock that steps backwards — a timezone change, an
      NTP correction — currently lets an old write beat a new one. Cheap, invisible, and the
      longer it waits the more rows carry timestamps nobody can trust
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
