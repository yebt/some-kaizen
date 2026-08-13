# What to take from init.Habits

A study of [inithabits.com](https://inithabits.com) and its four free tools, and a staged plan
for the parts worth having. Analysis only: nothing here has been built.

The headline request is a **terminal mode** — a system setting that swaps the whole interface
for a monospace, command-driven one — alongside several features and their four web tools.

---

## 1. Terminal mode

### What it actually is, and why it is not a skin

The tempting reading is "a monospace theme". That reading is what makes it fail, because it
implies re-skinning twelve routes and then maintaining twenty-four.

The accurate reading: **a terminal is a different shape of application, not a different
paint.** It has one screen, several panes, a command line and a keyboard map. So terminal
mode should have *fewer* routes than the current app, not the same number doubled.

The reason this is feasible here at all is the architecture we already have. Every screen in
`src/pages` is a thin shell over `application/` queries and `domain/` functions that hold all
the rules. A second shell reads the same queries and calls the same constructors. Nothing in
`domain/` or `application/` should gain a single line for this to work — and if it does, that
is the signal the seam is being cut in the wrong place.

### The command line is a parser into the domain

This is the part that makes terminal mode more than decoration, and it is worth stating
plainly: **our domain constructors already behave exactly like a CLI needs them to.**

```
$ habit --new "Gym" --days mon,wed,fri
```

is `onWeekdays([1,3,5])` followed by `createCompletedHabit(...)`. Every one of those
constructors validates its input and throws a named error carrying a human sentence —
`InvalidWeekdaysError`, `InvalidFrequencyError`, `InvalidMeasureError`. A command line's whole
job is to turn text into a call and print the failure. Ours is already written.

So the parser is a genuinely thin layer: tokens in, domain call out, error message printed
verbatim. It cannot invent an invalid habit, because the same wall that stops the form stops
it.

### The constraint that decides whether this is worth doing

init.Habits is a **checklist grouped by routine**. We are a **day with hours in it**. Our own
README opens with the claim that a checkbox tells you whether and never when.

A terminal mode that renders a flat `[ ] Meditate` list would quietly throw away the entire
thesis of the product in exchange for looking cool. So the rule is:

> **The terminal day view is still a timeline.** Hours run down a gutter, occurrences are
> blocks with height, block time is a band.

And this is the good news rather than the compromise: a monospace column *is* a ruler. Fixed
character cells are the one typographic situation where an ASCII timeline is exact rather
than approximate.

```
  07:00 │ ▓▓ meditate           20m  [✓]
  08:15 │ ░░ commute
  09:00 │ ░░ work ─────────────────────┐
  11:00 │ ▓▓ drink water     1.4/2 L   │
  17:00 │ ░░ ──────────────────────────┘
  18:00 │ ██ gym               75m  [ ]
```

### What is honest about it on a phone

Most of the value in their desktop screenshot is the **keyboard map** — `j/k`, `tab`, `1–5`,
`?`. That is a real productivity win and it exists only where there is a keyboard.

On a phone, terminal mode is an *aesthetic* plus a command line. That is a legitimate thing to
want, and it should be sold as that internally rather than as a power feature, or we will
build a keyboard-first interface for a device with no keyboard.

### Non-negotiables it inherits

Any terminal theme must pass `src/shared/assets/tokens.spec.ts`. ANSI palettes are famous for
looking beautiful and measuring 2:1 — we just spent a commit fixing exactly that in our own
palette, and a new theme is not an exemption. The spec should grow to iterate over *every*
declared theme rather than the two it knows about.

---

## 2. Worth taking, ranked

### A. Routines — grouped habits with their own progress

Their `☀ Morning [3/4]`, `💻 Deep Work [1/4]`, `🌙 Wind Down [1/3]` is the single best idea in
the product, and we have nothing like it.

It maps onto our model unusually cleanly, because **a routine is what block time is already
shaped like**: a named span of the day. Today a block is "hours you do not get to move". A
routine would be "a named group of habits that share a stretch of the day", with its own
completion count.

It also fixes a real gap. Right now, a day with fourteen habits is a flat list of fourteen
rows. Grouping is the only thing that scales that.

### B. Their morning routine planner is our timeline, entered as text

The tool takes a wake-up time and a list of steps with durations, then **cascades the start
times forward**. That is precisely `scheduleAt` plus `resize` applied down a list.

Which means it is not a separate feature at all — it is a **third input method for the day we
already model**: drag onto an hour, type an exact time, or write a list of durations and let
the day fall out of it. For a morning routine, the third is obviously the fastest.

Their presets are worth copying too: *20/20/20*, *the calm 15*, *the focused 45*. Presets are
how someone with no routine gets a first one.

### C. Data windows on stats

`[7d] [30d] [90d] [365d] [all] [custom]` on every statistic. We currently have one fixed
six-month heatmap and lifetime numbers. This is cheap — the statistics functions already take
a date range — and it changes stats from a trophy cabinet into something you interrogate.

### D. Day-of-week breakdown

```
best day: fr (88%)    worst day: tu (41%)
```

The most *actionable* number in their whole product, and we already store everything needed
to compute it. "You fail on Tuesdays" is advice. "Your completion rate is 68%" is not.

Pairs naturally with the weekday schedules we just shipped: if a habit named Mon/Wed/Fri and
Wednesday is its worst day, the app can say so.

### E. Timers on measured habits

`⏱ 0s / 1h30min` on *Deep work*. A measured habit whose unit is time and whose value can be
accumulated by a running timer instead of typed. Our `Measure` already carries unit, minimum
and goal; what is missing is a way for the value to arrive from something other than a
keyboard.

### F. Health data as a value source

`tracking mode: healthkit (sleep duration)`. A measured habit that fills itself from the
platform's health store — steps, sleep, distance, workouts.

The clean shape is a **source** on a measured habit: `manual | health`. Everything downstream
already works, because a value is a value. The cost is entirely native: HealthKit and Health
Connect plugins, a permission flow, and a background read. Late stage, high value, and the
only item here that touches privacy — which for an app whose landing page says "no server" has
to be handled carefully and stated plainly.

### G. Small presentation settings with real payoff

From their appearance screen, three that are genuinely good and nearly free:

- **move completed to bottom** — a done row stops competing for attention.
- **cross out completed** — an outcome you can read at a glance.
- **text size** — ours is fixed; a habit tracker is glanced at, often without glasses.

### H. The tools, as a surface of their own

Four single-purpose web tools, no account, local storage, export as PNG / JSON / CSV. They do
three jobs at once: they are genuinely useful, they are the acquisition funnel, and they are a
credibility argument for the privacy claim.

We are unusually well placed to build these because **the landing is already an Astro site and
our statistics and domain code are plain TypeScript with no framework in them.** A tool page
can import `positiveStatistics`, `achievementFor` and the calendar helpers directly. The tools
would not be a reimplementation; they would be a second consumer of the same domain.

Ranked by value to us:

1. **Heatmap generator** — we already render heatmaps. Add habits, tick days, export a PNG.
2. **Morning routine planner** — becomes the routine builder from (B), shipped early on the
   web where it costs nothing.
3. **Habit ideas** — a categorised list. Trivially cheap, genuinely useful in the app too as
   a starting point for a first habit.
4. **75 Hard tracker** — see below; it needs the challenge concept.

### I. 75 Hard, and the shape of a "challenge"

Their tracker gives the challenge concept a concrete definition we can model:

- a **fixed length** (75 days),
- a **fixed set of daily tasks**, all of which must be done,
- **all-or-nothing days** — the day only counts if every task is done,
- and a **restart rule**: miss one, go back to day 1.

That last rule is the interesting one, because it is the exact opposite of everything else we
believe — our whole product says days accumulate rather than needing to be perfect. And that
is fine: 75 Hard is a *programme someone opts into*, not a philosophy we impose. Modelled as
its own container with its own rules, it does not contaminate the habit model.

---

## 3. What I would not take

**XP, levels, badges and tiers.** The argument is unchanged from the ANOTHER.md study: an
extrinsic reward attached to something you already wanted to do reduces how much you want it
once the reward stops. It also breaks completely on quitting habits, where losing points for a
relapse makes lying to the app the rational move.

**Shields — and this one specifically.** `shields: 🛡 0/3` is a streak freeze: a currency that
repairs a broken streak. It is worth naming precisely because it is the most tempting item on
the list and the most corrosive: **a streak is a measurement, and the moment it can be
repaired it measures nothing.** After a shield, the number on screen is no longer "days you
did the thing"; it is "days you did the thing, plus days you paid for". Every statistic
downstream inherits that lie.

If we ever want the kindness that shields are reaching for, the honest version is a *separate,
visible* number — "longest run, allowing one miss" — which tells the truth and still forgives.

**Accounts, plans and `[pro]`.** Their commercial model, not ours.

---

## 4. Staged plan

Ordered so each stage is useful on its own and none blocks on the next.

### Stage 1 — Routines *(no terminal mode required)*

Group habits into named routines with their own progress count. Ship the morning-routine
builder — start time plus cascading durations — as a second way to fill a day. This is the
biggest single improvement to the app as it stands, and it is a prerequisite for terminal mode
being interesting, because a terminal pane over fourteen ungrouped rows is just a long list.

### Stage 2 — Stats worth reading

Data windows on every statistic, the day-of-week breakdown, and a per-habit summary block.
Small, self-contained, and it makes the stats screen answer questions instead of reporting
totals.

### Stage 3 — The tools, on the landing

Heatmap generator and habit ideas first, both importing our own domain. The routine planner
follows from stage 1 for free. Each is a static Astro page with local storage and an export.

### Stage 4 — Terminal mode

Now that there is something worth showing in a pane. In order:

1. A **theme layer** that can express a monospace, ANSI-flavoured world, with the contrast
   spec extended to cover every theme.
2. A **single terminal route** with panes: status, day, stats. The day pane is a timeline,
   not a checklist.
3. The **command line**, as a parser onto existing domain constructors, printing their errors
   verbatim.
4. The **keyboard map**, desktop only and honestly labelled as such.

The setting itself is one line in `Preferences` beside theme and clock — `shell: ui | term` —
and the router picks a shell from it.

### Stage 5 — Values that arrive on their own

Timers first, since they need nothing native. Health sources after, with the permission story
and the privacy claim worked out before a line of it is written.

### Stage 6 — Challenges

75 Hard as the first concrete programme, modelled as its own container with its own restart
rule, deliberately outside the habit model.

---

## 5. Open questions

1. **Does terminal mode replace the shell, or is it a fifth tab?** A setting that swaps the
   entire app is a much stronger idea and a much bigger commitment. A `/term` route reachable
   from the tab bar is cheap and gets most of the value on desktop.
2. **How much of the app must terminal mode cover before it ships?** A terminal shell that
   cannot create a habit is a demo. My instinct is: today's list, the day timeline, stats, and
   habit creation. Settings can stay in the graphical shell without embarrassment.
3. **Do routines own their habits, or tag them?** Owning is simpler and matches their model.
   Tagging lets one habit belong to both *Morning* and *Health*, which is truer but costs a
   join everywhere.
4. **Health data and the privacy claim.** The landing currently says, in large type, that
   nothing is ever sent anywhere. Reading from HealthKit does not break that — but the claim
   will need re-reading word by word before we do it.
