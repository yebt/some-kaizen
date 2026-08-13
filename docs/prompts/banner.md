Write two self-contained SVG files in the current directory: `banner-light.svg` and
`banner-dark.svg`. They are the header image of a GitHub README, shown through a
`<picture>` element that swaps them by colour scheme.

## The product

"Some Kaisen" — a mobile-first habit tracker that gives habits a place in the day rather
than a checkbox in a list. Fully offline, stored on the device. Its ideas: a day has a
shape; habits are placed on it by dragging; progress accumulates rather than being perfect.

## Canvas

- `viewBox="0 0 1200 300"`, `width="1200" height="300"`.
- No external references at all: no `<image href>`, no webfonts, no `<script>`, no CSS
  `@import`. GitHub strips them and the banner would render broken.

## Palette — use these exact values, nothing else

| role | light | dark |
|---|---|---|
| background | `#f2f0ec` | `#1f1e1c` |
| ink (headline) | `#1f1e1c` | `#f2f0ec` |
| muted (subtitle) | `#6b6862` | `#a5a099` |
| hairline | `#dcd8d0` | `#332f2b` |
| ring track | `#d9d5cc` | `#4a4944` |
| accent | `#c9a227` | `#c9a227` |

## The mark — reproduce it exactly, it is the app's existing icon

A ring that is nearly but not quite closed: one heavy grey track, one heavy accent arc over
its top right quadrant, one small solid dot at the centre. In a 64-unit box it is:

```
<circle cx="32" cy="32" r="15" fill="none" stroke="TRACK" stroke-width="7" />
<path d="M32 17a15 15 0 0 1 12.99 22.5" fill="none" stroke="#c9a227" stroke-width="7" stroke-linecap="round" />
<circle cx="32" cy="32" r="4" fill="INK" />
```

Scale and translate it; do not redraw it by hand and do not change its proportions.

## Composition

- The mark on the left, vertically centred, roughly 120 units across.
- To its right: the wordmark "Some Kaisen" and, under it, the line
  "Habits with a place in the day".
- Right of centre, a quiet abstraction of the day timeline: a vertical stack or horizontal
  run of rounded bars in the hairline colour at varying lengths, with one or two in the
  accent. It should read as a schedule, not as a chart. Keep it subordinate to the wordmark.

## Type

- Use a system font stack in `font-family`, e.g.
  `ui-sans-serif, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`.
  Metrics differ per machine, so anchor text with `text-anchor` and leave generous room
  rather than relying on a measured width.
- Headline around 56px, semibold (`font-weight="600"`), slight negative letter spacing.
- Subtitle around 22px, regular, in the muted colour.

## Craft

Restrained and typographic. Warm off-white paper and near-black ink, one gold accent used
sparingly. No gradients, no drop shadows, no rounded-corner card behind everything, no
emoji, no stock decoration. Empty space is part of the design.

Write both files. Then print nothing but a one line confirmation.
