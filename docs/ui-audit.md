# UI audit — 2026-08-13

Technical quality audit of the app's interface, at commit `a7b3e63`.

**Status: every finding below has been fixed**, except the one marked as a false positive and
the P3, which was a deliberate decision rather than a defect. `src/shared/assets/tokens.spec.ts`
now measures the palette on every run, so the contrast findings cannot come back silently.

## Health score

| # | Dimension | Score | Key finding |
|---|-----------|-------|-------------|
| 1 | Accessibility | 2 | Secondary text and every border fail WCAG AA in light mode |
| 2 | Performance | 4 | No images, no webfonts, 31 kB gzipped largest chunk, route-split |
| 3 | Theming | 3 | Complete token system; the light palette's secondary ramp is too weak |
| 4 | Responsive | 3 | Fluid and mobile-first; icon buttons below the 44 px comfort target |
| 5 | Implementation integrity | 4 | Detector clean; the code is unmistakably this product |
| **Total** | | **16/20** | **Good — address accessibility** |

## Implementation integrity verdict

**Pass.** `detect.mjs` returned zero findings across `src/pages`, `src/modules` and
`src/shared/ui`. The implementation expresses one coherent, product-specific system: domain
types that make impossible states unrepresentable, gestures built for touch rather than
adapted from a desktop library, and copy in the product's own voice. Nothing here is
interchangeable with an unrelated app.

The one thing worth naming as *not* a defect: the hex literals in `shared/domain/colour.ts`
and `shared/domain/appearance.ts`. Those are the user-selectable habit colours and the two
ink tones the contrast calculation picks between — data and algorithm input, not theme
tokens that escaped the system.

## Executive summary

- **16/20**, Good.
- 7 issues: 0 × P0, 3 × P1, 3 × P2, 1 × P3.
- The three P1s are one systemic problem wearing three hats: **the light palette's
  secondary ramp is too close to the canvas.**

## Findings

### [P1] `ink-subtle` fails AA against every surface in light mode

- **Location**: `src/shared/assets/main.css:25`; used in 48 places across `.vue` files, 7 of
  them at 10 px.
- **Category**: Accessibility / Theming
- **Measured**: 2.16:1 on canvas, 2.48:1 on surface, 2.27:1 on sunken. AA needs 4.5:1.
- **Impact**: Hints, timestamps, empty-state text and the timeline's hour labels are the
  hardest text in the app to read, and they are the text that explains how the app works.
  In sunlight on a phone — the actual use scene — this is closer to invisible than to faint.
- **Standard**: WCAG 2.2 §1.4.3 Contrast (Minimum), AA.
- **Recommendation**: Lift the token to roughly `oklch(52% 0.006 85)`, which lands near
  4.6:1. Dark mode's value is nearly compliant already (3.16:1 on canvas) and needs a smaller
  lift.
- **Suggested command**: `/impeccable colorize`

### [P1] `ink-muted` fails AA for body-size text in light mode

- **Location**: `src/shared/assets/main.css:24`; used in 111 places, mostly at 12–14 px.
- **Category**: Accessibility / Theming
- **Measured**: 3.72:1 on canvas, 4.28:1 on surface, 3.93:1 on sunken. Passes only for large
  text (≥18.66 px bold or ≥24 px), which is not how it is used.
- **Impact**: Every form label, every section subtitle and most secondary copy. Dark mode is
  fine (6.08–6.83:1), so this is specifically a light-mode defect and will be invisible to
  anyone developing in dark.
- **Standard**: WCAG 2.2 §1.4.3, AA.
- **Recommendation**: Around `oklch(46% 0.008 85)` reaches 4.5:1 on canvas.
- **Suggested command**: `/impeccable colorize`

### [P1] Borders are not visible enough to be component boundaries

- **Location**: `src/shared/assets/main.css:33`; `border-line` used in 85 places.
- **Category**: Accessibility / Theming
- **Measured**: 1.31:1 against surface in light, 1.16:1 in dark. UI boundaries need 3:1.
- **Impact**: `border-line` is the *only* thing marking the edge of every text input, every
  select, the segmented control and every card. A user who cannot see the boundary cannot
  see there is a field there. This is the most consequential of the three, because unlike
  faint text it removes an affordance rather than making one hard to read.
- **Standard**: WCAG 2.2 §1.4.11 Non-text Contrast, AA.
- **Recommendation**: Inputs and controls should use a token at 3:1 or better;
  `line-strong` can stay decorative for card edges where the surface change already carries
  the boundary.
- **Suggested command**: `/impeccable colorize`

### [P2] `prefers-reduced-motion` is honoured in exactly one component

- **Location**: only `src/shared/ui/drag/DraggableItem.vue:82`. 17 `.vue` files animate.
- **Category**: Accessibility
- **Impact**: The Today list's create/delete transitions, the swipe translate, every
  `active:scale`, and the dialog entrances all run regardless. For a vestibular-sensitive
  user the swipe and the list reflow are the uncomfortable ones.
- **Standard**: WCAG 2.2 §2.3.3 Animation from Interactions (AAA), plus general comfort.
- **Recommendation**: One media query in `main.css` that shortens transitions and removes
  translate/scale while **keeping** the state change visible — not a blanket `0.01ms` kill,
  which destroys the feedback that tells you a swipe registered.
- **Suggested command**: `/impeccable animate`

### [P2] Icon buttons are 28–36 px on a touch-first app

- **Location**: `size-7` in `src/pages/index.vue:680`; `size-8` in `index.vue:526`,
  `block-time/index.vue:178`, `habits/index.vue:292`, `day/[date].vue:499` and `:506`;
  `size-9` in `index.vue:643`, `habits/index.vue:194`.
- **Category**: Responsive / Accessibility
- **Impact**: The day's previous/next arrows and Today's per-row actions are the smallest
  targets in the app and sit next to other controls. They clear WCAG 2.5.8 (24 px minimum)
  but miss both platforms' own guidance (44 px iOS, 48 dp Android).
- **Standard**: WCAG 2.2 §2.5.5 Target Size (Enhanced), AAA.
- **Recommendation**: Keep the drawn size and extend the hit area with padding or a
  pseudo-element, the way the timeline's resize grip already does.
- **Suggested command**: `/impeccable adapt`

### ~~[P2] No visible focus style is authored anywhere~~ — FALSE POSITIVE

**Withdrawn.** The original scan looked for `focus-visible` in `.vue` files only. The rule
exists, and has all along, in `main.css` under `@layer base`:

```css
:focus-visible {
  outline: 2px solid var(--color-ink);
  outline-offset: 2px;
}
```

A 2px ring in the primary ink at 14.7:1, offset clear of the pill shapes, on both themes.
Nothing to fix. Recorded rather than deleted because an audit that quietly removes its own
mistakes is an audit nobody can check.

### [P3] Two gutter markers overlap when occurrences share a start minute

- **Location**: `src/pages/day/[date].vue`, the hour-column markers.
- **Category**: Implementation integrity
- **Impact**: Both render at the same `top`, so the tap hits whichever is last in the DOM.
  Labels are identical, so it is invisible rather than wrong, and the card itself remains a
  second route in. Known and deliberately not papered over: nudging the marker would make
  the ruler lie about position.
- **Recommendation**: Leave it, or stack with a count once it is a real complaint.

## Patterns

**One systemic issue, three symptoms.** The three P1s are all the light palette's secondary
ramp sitting too close to the canvas. Dark mode is measurably fine, which is exactly how a
defect like this survives: it is invisible to anyone who develops in dark mode. Fixing the
tokens fixes 244 usage sites without touching a component.

**Everything else is habit-level, not structural.** Reduced motion and focus styles are
missing rather than wrong — they were never added, as opposed to being added badly.

## What is working

- **Landmarks and headings**: one `<h1>` per page, `<main>` and `<nav>` present, no heading
  level skipped.
- **Toasts announce themselves**: `role="status"` with `aria-live="polite"` in `FeedbackHost`.
- **Native `<dialog>` with `showModal`**, so focus trapping, inert background and Esc are the
  platform's rather than reimplemented.
- **Labels everywhere**: every icon-only control carries an `aria-label`; the resize grip is
  deliberately `aria-hidden` because an equivalent accessible control exists behind the tap.
- **No `outline-none`, no `will-change`, no fixed pixel widths, no images at all.**
- **Performance**: nothing to lazy-load because there is nothing heavy; the largest chunk is
  31 kB gzipped and routes are split.
- **Zero horizontal overflow** and a mobile-first layout with real safe-area handling.

## What was done

**Contrast.** `ink-muted` 58% → 46%, `ink-subtle` 72% → 53% in light; 68% → 72% and 50% → 62%
in dark. `line-strong` became the control boundary at 63% / 52%, clearing 3:1 on every
surface, and it now carries every input, select and outlined button. `line` stays soft: a
divider separates things already distinguishable and is exempt.

Passing the floor was not enough on its own. At exactly 4.5:1 both secondary tones solve to
the *same* lightness, so the obvious fix would have deleted a tier of hierarchy while
satisfying the checker. The gap between them is smaller than it wants to be, and everything
below muted now leans on size and weight instead of more grey.

**A drift caught in the act.** The dark palette is declared twice — once under
`prefers-color-scheme`, once under `[data-theme='dark']` — because CSS cannot share a block
across that boundary. The first edit updated only one of them, which would have left anyone
with dark explicitly chosen on the old failing values. `tokens.spec.ts` now fails when the
two disagree.

**Motion.** Rows still fade in and out; they no longer slide. The fade is the only thing
telling you which row was just created or deleted, so removing it would have answered a
request for calm by removing the feedback rather than the discomfort. Gated per transition
rather than globally, because `translate` is also how the drag ghost is centred and how the
timeline's hour markers are aligned — a blanket rule would have broken the layout for exactly
the people least able to tolerate it.

**Targets.** A `hit-area` utility gives fourteen icon controls a 44px reachable area without
changing what is drawn. Four containers had their gaps widened from 4–8px to 12px first:
two 44px areas four pixels apart overlap, and in the overlap the later element wins — the
right edge of "previous day" would have quietly triggered "next day". That would have been a
worse bug than the small target it fixed.
