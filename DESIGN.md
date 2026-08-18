# Design

<!-- impeccable:design-schema 1 -->

Two surfaces share one world. `apps/tracker` is the application; `apps/landing` is the site
that presents it. The site inherits the app's palette and adds exactly one thing the app has
no use for: an ink for pointing at things.

## The world

**Warm, nearly colourless, with colour reserved for meaning.** A habit tracker is looked at
every morning, and a loud interface becomes exhausting long before it becomes useful. The app
is built on OKLCH tokens because it keeps perceived lightness steady as hue changes.

| Role | Light | Dark |
|---|---|---|
| Ground | `#f2f0ec` | `#191817` |
| Raised | `#fbfaf8` | `#232220` |
| Ink | `#1f1e1c` | `#f2f0ec` |
| Ink, muted | `#605d57` | `#b0aba3` |
| Hairline | `#dcd8d0` | `#34312d` |
| Control border | `#b8b2a8` | `#55514b` |
| Annotation | `#c9a227` | `#d8b442` |

The application's authoritative tokens live in `apps/tracker/src/shared/assets/main.css` and
carry two rules worth repeating. Every text tier clears 4.5:1 against the lightest surface it
can sit on — measured for a phone in daylight, not a monitor indoors — and there are two
border weights with different jobs: a hairline separates things already distinguishable, and a
control border clears 3:1 because it is the only thing saying a control is there.

### Gold is a line, never a word

`#c9a227` is the mark's colour and, on the site, the annotation ink: leader lines, callout
pins, the underline on a hovered link, the rule beneath a column heading. It **never sets
text**, because at that lightness it cannot clear a contrast floor on this ground. A pin is a
gold disc with dark ink on it, which does clear it. A colour that has to be read is a
different decision from a colour that has to be seen.

## The mark

A ring not quite closed: a heavy grey track, a gold arc over the part that is done, a solid
dot at the centre. It is the product's one idea in one shape — progress accumulates, and it is
not finished. Drawn in `apps/landing/src/components/Mark.astro` and in
`docs/assets/banner-{light,dark}.svg`; the specification is `docs/prompts/banner.md`.

## Type

- **Application:** the system stack, because the app is fully offline and a webfont would mean
  a silent fallback exactly when there is no connection.
- **Site:** **Archivo** (variable, weight and width axes), self-hosted from
  `apps/landing/public/fonts/`, SIL OFL 1.1. Headings are set at `wdth 116` and weight 600 with
  `-0.035em` tracking; a caption set wide reads as a caption rather than as a large paragraph.
  Nothing is fetched from a font CDN — the site makes no third-party requests at all, which is
  the same claim the product makes and would be embarrassing to break on its own home page.
- Monospace (`ui-monospace`) is reserved for **data and measurement**: clock times, percentages,
  status values in a ledger, callout indices. It is never used to make prose look technical.

## The site's form: annotated plates

The landing is an **annotated field guide**, not a hero with three feature cards. Its argument
is made by photographs of the running application with the specific pixels a sentence is about
pointed at.

- A **plate** is a real screenshot with gold leader lines running to numbered pins. The pins
  stand **outside** the shot, never on top of it; a number covering the thing it points at
  defeats the whole arrangement.
- The notes repeat below the plate as an ordered list, which is how the callouts reach a
  screen reader and how they survive a narrow viewport.
- A **ledger** — a ruled list with a right-aligned monospace status column — carries anything
  that is a set of facts with a state: what the app refuses to do, what exists and what does
  not, which tools are built.
- Sections are a **19rem margin** holding a caption-scale heading and a note, beside the field.
  The one enormous line on the site is the opening; repeating that scale in the margin only
  produces four words to a line.

Imagery is produced, never drawn: `apps/tracker/e2e/capture.spec.ts` drives the real
application through its own import, against five months of generated history in
`e2e/support/worked-example.ts`, and writes the PNGs into `apps/landing/src/assets/plates/`.
No stock photography and no illustrations of interfaces exist anywhere on the site.

## Motion

**One authored moment.** When a plate scrolls into view its leader lines draw themselves and
the pins settle, the way an annotation is added to a page in front of you. Everything is in
its final state before any script runs — the hiding is applied by a class the script adds — so
a browser with scripting off gets a finished page rather than an empty one. Honoured behind
`prefers-reduced-motion`. There are no other entrance animations and no scattered hover
effects; hovers change colour and nothing else.

## Radii and depth

Radii come from the app: `0.875rem` for a cell, `1.25rem` for a card, `1.75rem` for a sheet.
Shadows always carry an offset and a soft blur — a device plate uses
`0 2px 4px / 0 20px 50px` at low opacity. There are no zero-offset halos and no hard block
shadows anywhere in this world.

## What this world refuses

- Gradients as decoration, gradient text, and glass used for its own sake.
- Cards of icon-plus-heading-plus-text as a page's structure.
- Eyebrows and kickers above headings.
- Monospace as a costume for "technical".
- Any third-party request: no font CDN, no analytics, no embedded media.
