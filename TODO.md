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
- [x] **A library of routine presets to import from.** Four bundled: *the calm 15*,
      *20/20/20*, *the focused 45*, *wind down*. Importing one creates the routine **and the
      habits it needs**, and the merge is the whole difficulty: a habit of the same name is
      taken in with its history rather than duplicated, and it leaves whichever routine had it
      in the same write. Matched ignoring case and spacing. Archived habits are deliberately
      *not* matched — archiving was a decision to stop, and reviving one as a side effect of
      importing a template would quietly undo it. What lands is ordinary habits and an
      ordinary routine, with the preset's lengths on them so the builder works immediately.
      The screen says what it will create and what it will reuse, by name, before you tap
- [x] **Sharing one, and opening one somebody sent.** The trust model is the *shape of the
      document* rather than a check performed on it: a shared routine is a recipe, not a
      record. Names, lengths and an hour go out; identifiers, dates, archive flags, entries
      and habit ids do not. So there is nothing in the file that could name, replace or
      revive anything on the device it lands on, and nothing on the way back in to sanitise
- [x] Which is why it reads into a `RoutinePreset` rather than a `Routine`. The preset import
      already mints every identifier locally, matches habits by name, and says what it will
      create and reuse before writing. A stranger's routine goes through exactly the door a
      bundled one does, because it is exactly as trusted — which is to say, not at all
- [x] Refusing rather than repairing. A four hundred character name or a negative length is a
      broken document, and cutting it to size would import something nobody wrote. The one
      exception is the anchor hour: losing it costs an ordering, and throwing away four good
      steps over a decoration would be the strictness doing more damage than the fault
- [x] The key is minted on reading and never taken from the document, or a file could put
      somebody else's writing under a name this app vouches for
- [x] Proved as a round trip in a real browser: written out through a download, opened again
      through a file picker, on the same device — the harshest version, since that is where
      anything able to address what is already here would show
- [ ] A library to browse, rather than a file to be handed. Needs somewhere to put it

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

- [x] Habits that name their weekdays make this interesting: pulling Monday's plan onto a
      Tuesday drops the Monday-only ones rather than scheduling them wrongly, and names them
      in the preview. Archived habits and habits deleted since are dropped too
- [x] Pulling a plan is an explicit act with a preview, never a silent copy. The offer appears
      on the day it applies to, says what would arrive and what would not, and takes itself
      away once the day is arranged
- [x] Nothing already on the target day is touched. A decision made about today outranks one
      made about a day that has been and gone, and an import that silently overwrites is one
      nobody presses twice
- [x] Carried occurrences take the identity the target day derives, so a carried card merges
      with the duty already implied there instead of doubling it. Times and reminders come
      with them; an occurrence that never had a time still arrives without one
- [x] "Bring a specific day's" — the preview is a dialog with a date field, so the day the app
      suggests is only where it opens. It recomputes as the field changes, which is the
      difference between a preview and a warning: you can look at two candidate days before
      committing to either

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
- [x] Real-browser gesture tests, aimed at geometry rather than at recognition. Carrying a
      chip out of the drawer onto an hour; a card carried by the point it was grabbed rather
      than snapped to the finger; a press that moved first being left as a scroll; a card
      dropped on the strip losing its hour and not its day. The one that earns the most is
      simply that **what the gutter promised while the card was in the air is what was
      written when it landed** — a drift between those two expressions was every timeline bug
      this app has had, and it is invisible to a test that only checks the write
- [x] Run them in Firefox as well as Chromium — both, on every one
- [x] It found a regression the moment it ran, and one I had just introduced: the control
      added to the chip so a habit could be placed without a gesture had taken the chip's
      middle. A touch target is at least 44px whatever size the icon in it, so two of them on
      a chip reading "Run" left nothing to hold. Now one control, and the name keeps a thumb's
      width of its own. Taking a habit off the day moved into the sheet, which also gave
      *that* a way in that is not a gesture — it was previously only reachable by dragging
      onto a strip
- [ ] **Real multi-step touch is still not driveable here.** `page.touchscreen` only taps, and
      raw `Input.dispatchTouchEvent` over CDP never reached the page — the same unreliability
      recorded the last time, reproduced independently. What is covered instead is the
      contract that decides whether the browser steals the gesture at all: a chip declares
      `touch-action: none`, a card declares `pan-y` so the day stays scrollable, and a card in
      the air refuses `touchmove` through a listener rather than a declaration. Worth
      revisiting if a driver appears; the untested remainder is whether a real finger's
      scroller can still steal a hold

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

### Actions that were reachable only by gesture

- [x] **Giving a habit an hour.** Dragging a chip out of the drawer was the only way to place
      one on the ruler, which made the single thing the day screen exists for unavailable to a
      keyboard, to a screen reader, and to plenty of hands. Each chip now carries a control
      that opens the same sheet a placed card opens — the sheet could always write an hour
      through its Starts field, it simply could not be opened for a duty that had none yet.
      Dragging stays; it is the fast path and it is good, it just is not the only one
- [x] Recorded here earlier as "a did-it habit can only be completed by swiping". **That was
      wrong.** The row has always carried a `Mark <habit>` button with `aria-pressed`, and it
      works by keyboard. The claim came from grepping for the wrong strings rather than from
      driving the screen, which is exactly the mistake a browser test exists to prevent — and
      one now covers it

### Found by whole-journey tests over rich data — all fixed

Three defects that every single-feature test passed straight through, because none of them
belonged to a feature. They are recorded here because the *shape* of each is worth
recognising again.

- [x] **Archiving a routine did nothing at all.** `archiveRoutine` spreads a record read from
      the query cache, so `habitIds` stayed a Vue proxy, and IndexedDB refuses to clone a
      proxy: `DataCloneError`, write lost, no message. Invisible to the unit suite because
      `fake-indexeddb` clones permissively and accepts what a browser rejects. Fixed at the
      boundary rather than in the six callers who each had to remember and did not: the
      storage adapter now snapshots every record to plain data on the way in
- [x] **The floating tab bar covered the last control of every list.** `safe-bottom pb-28` on
      the app shell — both write `padding-bottom`, so one was silently dropped and the
      clearance never applied. However far you scrolled, the last button sat under the bar.
      Fixed by making the extra additive (`--space-below`) so the two cannot fight again
- [x] A `step` beside a `min` on the occurrence sheet's minute field, the same browser
      validity trap already fixed on the habit form

### Reported and not yet fixed

Raised in one session and deliberately not attempted in it, because several of them were
introduced by fixing something else in the same sitting.

- [x] **Swiping a card off the ruler, right to left, takes its hour away.** A shortcut rather
      than the only route — the sheet on the card and the strip below both do it already —
      which is exactly why it can be a gesture without costing anyone anything. Rightward does
      nothing on purpose: there is no opposite of "take its hour away", and a gesture that
      fires both ways is one you make by accident half the time
- [x] It composes with the drag rather than competing. A drag needs the finger still first and
      any movement cancels the hold, so a swipe has already won by the time its axis locks.
      The order that needed saying out loud is the other one — hold, then move sideways —
      where the card is genuinely in the air and the swipe stands down, card included: it does
      not follow the finger sideways while a ghost is already doing that
- [x] Fixed on the way: pressing a card freezes the day so a refetch cannot pull the element
      out from under the finger, and only a *drop* thawed it again. A swipe never reaches the
      drop, so the card was unscheduled on disk and still drawn on the ruler — which reads as
      the gesture having done nothing. Only a browser could see it; the write was correct and
      the screen was lying

### The first run
- [x] **A device that has never been used goes somewhere, rather than to an empty screen.**
      The state it used to land on said "name a habit", which is a reasonable instruction only
      for somebody who already knows what this app is for — and it was the first thing the app
      ever said to them
- [x] Not a carousel. Three slides explaining what a habit tracker is would be tapped through
      by everybody and remembered by nobody. Two questions instead, both producing real
      records through the same constructors a form uses, and then it gets out of the way
- [x] The first question is the one that stops people: pick from the ideas that already exist,
      with the reason each is worth doing. The second is the one that makes this app different
      from the ones they already gave up on — sleep and work, so the day has a shape before
      anything is placed on it
- [x] Nothing is written until the last press, so backing out at any point leaves exactly the
      empty app that existed before. Skipping counts as an answer: asking again tomorrow would
      be the app refusing to hear no
- [x] Two conditions, not one. The stored flag alone would walk somebody through a welcome
      after restoring a backup onto a new phone; an empty database alone would send them back
      through it every time they deleted their last habit. And it waits for storage to answer,
      because deciding on the first frame sends every existing user through it once
- [x] **The payoff.** It ends on the day it just gave a shape to, not on a summary of it.
      The two questions it asks are "what would you like to do" and "when is your day already
      taken", and the answer to both is a timeline: shaded bands where the sleep and the work
      are, and the chosen habits waiting for an hour
- [x] The drawer opens with it, through `?tray=1`. A habit with no hour draws nothing on the
      ruler, so arriving to sleep and work and no sign of what was just chosen is half a
      payoff — the gesture between the two halves is the whole product, and both halves have
      to be on screen for that to be obvious
- [x] Unless nothing was made. Somebody who chose nothing and took the blocks off has no day
      to be shown, and an empty timeline is a worse ending than the ordinary home screen

### The plus in the tab bar
- [x] Reported: standing on the blocks screen, the big plus at the bottom obviously adds a
      block, and it opened a habit form. A control fixed to every screen cannot quietly mean
      a different thing on each one — you learn it once and it betrays you the second time
- [x] So it keeps one meaning and grows a second, deliberate one: tap adds a habit, hold
      offers everything the app can be given. The common case keeps the shortest route and
      the rest stop living behind a screen you have to already know about
- [x] A link no longer, now that it has two meanings. The tap that ends a hold would follow
      the href as well and open a form behind the sheet; navigating ourselves means never
      racing the router's own click handler for it
- [x] A hold is unreachable from a keyboard, so this is a shortcut and never the only route:
      every destination in the sheet is also a plain link on the habits screen. The context
      menu is bound too, which is the same gesture for a mouse and the one key that reaches it
- [x] **Reviewed, and removed.** The test that settled it: replay the original complaint
      against the fix. Standing on the blocks screen, tapping the plus *still* opened a habit
      form — the hold only ever helped somebody who already knew it was there, and a dark
      44px circle does not announce a 260ms secret. It fixed the problem for the person who
      no longer had it
- [x] Worse than that, 260ms is *under* Android's own long-press threshold, so a heavy thumb
      in the morning sometimes opened the sheet instead of the form. One control, two
      outcomes, probabilistically. That is what "diffuse" feels like from the inside
- [x] The sheet's own fourth item gave it away: *Challenge* went to a list rather than a
      form, so one of four "add" actions was not an add. When a menu cannot keep its own
      promise, the menu is the wrong frame
- [x] So the bar is four places to go and nothing to press, and creating lives on the screen
      that holds that kind of thing, where the button can say which kind it makes. Today's
      empty state carries its own invitation now, because it used to point at a control that
      no longer exists
- [ ] Which leaves the centre of the bar empty, and that is the right state for now. If
      anything ever earns it, the honest candidate is today's timeline — the product's whole
      thesis, and the twice-daily destination, currently buried behind an immersive route.
      That deserves its own evidence rather than being shipped as a consolation prize

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
- [x] A way in from the day screen itself. The day travels with the link, so the builder opens
      on the day you were looking at rather than on today — landing on today would make
      someone retype the one thing the screen already knew

### Presets and categories
- [x] Preset routines to start from — built; see the routine preset library under **Routines**
- [x] A browsable, categorised habit-ideas list — Body, Mind, Focus, Home, Quitting. Every
      idea says *why* as well as what, because a list of bare nouns is a list of chores and
      chores are what people stop doing. Chosen to be finishable: the failure mode of a list
      like this is aspiration, and "meditate 30 minutes, read 50 pages" reads as a description
      of somebody else
- [x] Reuse it in the empty state, which is the one place it is genuinely wanted. Still
      reachable afterwards from the habits header, without shouting about it
- [x] Categories resolved rather than built: they are a **heading in the bundled data and
      nothing else**, never a field on a habit. No statistic groups by one, so stored it would
      be a taxonomy to maintain that answers no question, plus one more thing to get wrong on
      a form. Here it is a way to find something in a list of eighteen — a job that ends the
      moment you have chosen
- [x] What lands is ordinary: a real habit built through the same constructors the form uses,
      with nothing recording that it arrived this way. An idea already tracked is marked on
      the row rather than offered twice, matched ignoring case and spacing — and an archived
      habit does not count, or the list would refuse a fresh start on the grounds that you
      once gave up

### Habit title and description
- [x] Optional `description` on a habit — the line that says *why*, on every kind including
      the ones you are quitting. Trimmed, capped at 140, absent rather than empty, and
      refused rather than truncated when it is too long: cutting somebody's sentence in half
      is worse than telling them it is too long
- [x] On the list it takes the "hold for actions" hint's place rather than adding a fourth
      line. Of the two, the hint teaches the app once and then stops earning its line, while
      the sentence that got you to write the habit down is the one you need on the morning you
      would rather not
- [x] It closes the loop on the ideas list: an idea's reason now travels onto the habit
      instead of being thrown away on the way in, which had left the app unable to answer a
      question it had just answered for you

### Icons
- [x] A symbol per habit, alongside the colour and pattern, on routines and block time too
- [x] Drawn set, one stroke weight, sixteen of them. Not emoji: an emoji is a different
      typeface on every platform, so a list styled on one phone is a different list on the
      next, and several carry a skin tone and a gender nobody chose. Kept deliberately small —
      a picker of four hundred icons is a decision most people abandon
- [x] Colour and pattern stay, and a symbol does not replace either. A symbol says *which*
      habit; a pattern says *this one differs from that one* even when the colours have
      collapsed into the same grey
- [x] The mark draws with a symbol alone, a colour alone, or both, and stays absent when
      neither is set. Plenty of people will choose one and leave the other, and a mark that
      needed both would read as the picker not having worked

### Stats worth reading
- [x] Data windows on every statistic: `[7d] [30d] [90d] [1y] [All]`. Clamped to where the
      history actually begins, so a thirty day window on an app used for six is measured over
      six — otherwise a rate is divided by days nobody could have answered and a new user's
      first week reads as a failure. Not remembered between visits: it is a question you ask
      of the data, not a preference about the app
- [x] Day-of-week breakdown — *"Best day Mon (88%), worst Tue (41%)"*, on the overview and on
      each habit's own page. Measured over days **answered**, not over every day in the
      window, so time away from the app is not counted as failure. A weekday with no answers
      reports nothing rather than zero. A weekday needs two answered days before it can be
      named, and a flat week names neither end — otherwise it is arithmetic dressed as a
      finding. A habit that names its days is not judged on the days it never claimed
- [x] Per-habit summary block: schedule, tracking since, days answered, usual hour and length,
      and the archive date when there is one
- [x] `[Pick]` — a window with both ends chosen by hand, which is a different question from
      the others. They all end today and answer "how is it going"; this one answers "how did
      March go" or "what happened while I was ill", and that needs an end as well as a start
      or it is just a longer default. Both ends clamped: a start before the history begins and
      an end after today each divide a rate by days nobody could have answered — and a window
      left open into next month would report a completion rate falling every morning. Ends
      given the wrong way round are read as the span between them rather than refused, because
      two date fields invite it and the meaning is unambiguous

### Notes on an entry — done
- [x] Optional `note`, trimmed, capped, and absent rather than empty
- [x] Written from the amount dialog, which had already interrupted you; never behind the
      swipe, which exists so that marking a day costs nothing
- [x] Read back on the habit's own page, newest first
- [x] A way in for a "did it" habit: one hold — or one tap on the row's own actions button —
      after the day has an answer. Never behind the swipe, which exists so that marking a day
      costs nothing. Offered *only* where there is a verdict to hang it off, because writing a
      note about an unanswered day would have to invent an answer, and this app is careful
      about the difference between a day answered badly and one never answered
- [x] A way in for a negative habit's verdict, and the note comes *with* the answer there
      rather than after it. That is not an inconsistency: the app has already stopped to ask,
      and the morning you answer is the one morning you know why. Yes and No stay one tap;
      this is a third door
- [x] It also closed a hole it was about to widen: the Today row's menu — edit, archive, give
      it an hour — was reachable only by holding. There is now an ordinary actions button
      beside it, sharing one function with the gesture so the two cannot offer different menus

### Challenges
- [x] A programme container: fixed length, fixed daily task set, all-or-nothing days. Started
      and given up on from `/challenges`; ticked on the day it belongs to, because a checklist
      you have to go and find is one you stop filling in
- [x] 75 Hard as the first one, restart-on-miss included — and *The 30 day reset* beside it,
      which forgives a miss. A fixed daily set is a useful shape without the punishment, and
      shipping only the punishing one would be the app taking a side it need not take
- [x] Modelled **outside** the habit model, in its own module with its own two stores. Every
      function that counts a day would otherwise have to ask which of two incompatible
      philosophies applied to it
- [x] Two rules do the work. Today is never a miss — it is in progress, exactly as a habit's
      current period is, and counting it would make the number collapse every morning and
      climb back by evening. And a missed day past resets the run without deleting the days
      behind it: they happened, a restart count says how often this has been true, but they no
      longer carry towards finishing
- [x] Completeness is derived rather than stored, so adding a task cannot leave old days
      claiming a completeness they never had — and a screen can show three of four at six in
      the evening
- [x] The day you give up on one is left open rather than judged: giving up is a decision, not
      a failure of that day. It leaves the day's checklist immediately, though — having just
      decided to stop, being asked to tick five boxes all afternoon is the app not listening
- [x] A challenge of your own, rather than only the two bundled ones. The presets are the
      common answers, not the only ones — somebody with a coach, a physio or a rule of their
      own has the same shape to describe, and offering that shape in two flavours made the
      model look narrower than it is. Offered *above* the bundled two: buried underneath it
      reads as the fallback for when neither of those fits, which is the wrong way round
- [x] A blank row is a row you did not fill in, not a task with no name. The form starts with
      three so it reads as a list without asking for three things, and drops the empty ones.
      Refusing a programme with nothing in it at all is a different claim, and still made
- [x] The rule is chosen with its cost written beside the switch, and the commitment is read
      back live — "20 days of 3 things, every day" — which is what catches a 20 typed where
      200 was meant. A confirmation afterwards catches that far too late: by then it is
      agreeing to something rather than checking it. So there is no confirmation on this one

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

- [x] **Somewhere to put them.** One workspace: `apps/tracker` and `apps/landing`. Two repos
      would have meant copying working code and watching the copies drift, which is a worse
      outcome than not shipping the tools at all
- [x] The site reads the domain across, through aliases that reach `*/domain/**` and nothing
      else. An import of a Vue component does not resolve — a boundary rather than a note
      asking people to be careful. `bun run build` at the root builds both, so a reorder that
      breaks the site turns red in the same run that made it
- [x] **The site itself.** An annotated field guide rather than a hero with three feature
      cards: every image is a photograph of the running application with the exact pixels a
      sentence is about pointed at, in gold, with the pins standing outside the shot. Produced
      by `capture.spec.ts` driving the real app through its own import, so nothing on the page
      is a drawing of an interface
- [x] Five months of plausible history behind the screenshots. The bundled demo data is two
      weeks old, which is right for somebody trying the app and wrong for a picture of its
      statistics — a heatmap of a fortnight is a picture of an empty grid
- [x] It loads nothing from anywhere else. The typeface is self-hosted, the images are local,
      there is no analytics and no cookie. A privacy claim that fetched a font from a CDN to
      make itself would be the page disproving its own headline
- [x] Licence, terms and privacy pages, and the repository gains `LICENSE` and `NOTICE.md`.
      AGPL-3.0-or-later, chosen because sync is planned and paid: under the ordinary GPL a
      closed hosted fork would be legal. Its cost is written down rather than discovered —
      Apple's terms conflict with the (A)GPL, so an AGPL-only iOS build could not ship there
- [ ] Heatmap generator
- [x] Habit ideas — the whole list rendered at build time from the tracker's own, so the page
      and the app's ideas screen cannot disagree. No JavaScript reaches the browser at all,
      which is the honest version of this site's privacy claim: there is nothing to send
- [ ] Routine planner (falls out of the builder above)
- [ ] 75 Hard tracker — no longer blocked; challenges exist now

### Health data as a value source
- [ ] A `source` on a measured habit: `manual | health`
- [ ] HealthKit and Health Connect plugins, permissions, background read
- [x] **Read, and it does not block this.** The claim now exists in this repository, at
      `apps/landing/src/pages/legal/privacy.astro`, and what it actually says is that the app
      *makes no network requests* — no analytics, no telemetry, no SDK that phones home.
      Health Connect and HealthKit are on-device APIs, so reading from them sends nothing
      anywhere and contradicts none of it. What the page would need is one added sentence
      naming the permission, in the paragraph that already names the notification one
- [ ] Which leaves the real question, which was never the privacy claim: a value that arrived
      from a watch is not a value somebody entered, and a day graded on a number the person
      never saw is a day they cannot argue with. `source` exists so a screen can say where a
      figure came from and let it be overridden, not so the app can fill itself in silently

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
