# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who have tried habit trackers and stopped using them. The job is not "record that I
meditated" — it is **deciding when today's habits actually happen**, in the morning, on a
phone, in under a minute, and then living the day already arranged.

Secondary: people arriving from the free web tools, who came for one small thing (a heatmap,
a routine plan) and discover the app underneath it.

## Product Purpose

Some Kaizen gives every habit **a place in the day** rather than a checkbox in a list. A
habit is dragged onto a day, then onto an hour, and the day becomes a timeline with the
things you sleep, work and commute through already on it. Success is somebody still using it
in month three, which the product pursues by refusing to make a missed day into a punishment.

## Positioning

The mechanism a neighbouring tracker could not truthfully copy: **habits are scheduled onto a
real day beside the hours already spoken for.** Blocks of time — sleep, work, the commute —
are first-class, cannot overlap each other, and habits may overlap them freely, so a plan is
checked against the day a person actually has rather than an empty one.

Second: **nothing leaves the device.** No account, no server, no sign-up. That is a
structural fact rather than a policy — there is no backend to send anything to.

## Operating Context

- Opened on a phone, most often in the morning and again at night.
- Used offline as the normal case, not the degraded one. Android, wrapped with Capacitor.
- Reminders are delivered by the operating system, and only in the installed app.
- Data moves by file: a single JSON backup, and routines shared one file at a time.

## Capabilities and Constraints

Confirmed and shipped:

- Three shapes of habit — *did it*, *measured* (unit, minimum, goal), and *quitting*, which is
  judged the following morning because that is the only moment the answer is known.
- A weekly board and a day timeline, planned by drag; occurrences may be given an exact time
  and a length, or left to happen sometime that day.
- Block time: sleep, work, anything immovable. Blocks may not overlap each other.
- Routines: named parts of the day, with a builder that cascades start times down a list.
  Bundled presets, and routines can be written to a file and opened from one.
- Challenges: a fixed length, a fixed daily set, all-or-nothing days, and a restart rule —
  75 Hard and a forgiving thirty-day variant, plus one you write yourself.
- Statistics with windows (7d/30d/90d/365d/all/custom), a six-month heatmap, and a
  day-of-the-week breakdown that refuses to name a best day before it has enough answers.
- Backup and restore by JSON file. Importing **merges** rather than replaces, and shows every
  collision before writing.
- Android's back button closes what is open before it touches the route.

Constraints:

- **Android only, today.** No iOS build exists.
- No webfont, no CDN, no analytics, no network calls of any kind in the app.
- Not yet released: there is no store listing and no tagged build. The APK will be published
  on GitHub or GitLab first, and Google Play later.

Undecided, and not to be invented:

- **Sync and hosted backup are planned and would be paid.** No price, no date, no tier names
  exist. Any surface may say it is coming; none may say what it costs or when.

## Brand Commitments

- The name is **Some Kaizen**. (Four stored identifiers inside the app are spelled
  `some-kaisen` on purpose — a database name and three file format strings — and must never
  be corrected. `apps/tracker/src/core/stored-names.spec.ts` fails if they are.)
- Tagline: **habits with a place in the day**.
- The mark is an existing asset: a ring not quite closed, one heavy grey track, one gold arc
  over it, a solid dot at the centre. Gold `#c9a227`. Defined in `docs/prompts/banner.md`,
  drawn in `docs/assets/banner-light.svg` and `banner-dark.svg`.
- The app's own palette is warm and nearly colourless, in OKLCH, with colour reserved for
  outcomes. Tokens in `apps/tracker/src/shared/assets/main.css`.
- Voice: plain, specific, unhurried. States what a thing does and what it costs. No hype, no
  streak-shaming, no exclamation marks.

## Evidence on Hand

- The working application, which can be screenshotted at any state — the strongest proof
  available and the intended source of every product image.
- A public repository: `github.com/yebt/some-kaizen`. Open source and auditable, which is the
  only real backing a privacy claim has.
- Free, with no accounts.
- **No users, testimonials, ratings, download counts, press or benchmarks exist.** None may be
  written, implied, or illustrated.

## Product Principles

1. **A day has a shape.** Plans are made against the hours already spoken for, never against
   an empty grid.
2. **Days accumulate; they are not graded.** A missed day is information, not an alarm. No XP,
   no levels, no badges, no loss of points for a relapse — that makes lying to the app the
   rational move.
3. **Nothing leaves the device, structurally.** Offline is the normal case. When sync arrives
   it will be an addition somebody opts into, never a requirement.
4. **Say what it costs before it is agreed to.** A rule is stated where the decision is made,
   never after it has been applied.
5. **Show the thing, never a description of it.** The app is the argument.

## Accessibility & Inclusion

- Every text tier clears 4.5:1 against the lightest surface it can sit on, and control
  borders clear 3:1 — measured on a phone in daylight, not on a desktop indoors.
- Gestures are always shortcuts. Anything reachable by a swipe or a hold is also reachable by
  an ordinary, keyboard-operable control.
- Motion respects `prefers-reduced-motion`.
