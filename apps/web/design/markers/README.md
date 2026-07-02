# Markers

Map marker SVGs for the six categories that ship default-on in M1
(see `docs/appendix-data-schema.md` §B for the canonical category list).

## Shape system (DEC-015)

Color is never the sole signal — every marker is uniquely identifiable in
black-and-white print by shape alone. Inner glyph adds redundancy at large
zoom.

| Category             | Kind     | Shape          | Inner glyph     |
| -------------------- | -------- | -------------- | --------------- |
| `curb_ramps`         | obstacle | triangle       | step-down ramp  |
| `barriers`           | obstacle | diamond        | horizontal bar  |
| `audible_signals`    | obstacle | hexagon        | speaker + wave  |
| `sidewalk_condition` | obstacle | pentagon       | surface + crack |
| `restrooms`          | aid      | circle         | figure          |
| `rest_spots`         | aid      | rounded square | bench           |
| `water_cooling`      | aid      | pill           | water drop      |

Obstacles use **angular** shapes (triangle / diamond / hexagon).
Aids use **rounded** shapes (circle / squircle / pill). The shape family
is itself a redundant cue — even before you read the glyph or color, the
silhouette tells you "obstacle" vs. "aid."

## How colorization works

Each SVG is authored with `fill="currentColor"` on the outer shape. The
consumer sets the fill color:

- **Inline SVG in React** (the parallel `<FeatureListView/>` icons): wrap
  in a span or element with `style={{ color: 'var(--color-obstacle-blocking)' }}`
  (or the relevant severity / aid token).
- **MapLibre map layer**: build a sprite + JSON manifest at build time from
  these source SVGs (one icon-id per shape × severity combination), or
  generate SDF sprites and colorize via `icon-color` paint property.

The white outline + inner glyph are baked in (literal `#ffffff`) because
they need to read against both the cream surface and the basemap, and
they don't change with severity or theme.

## Severity encoding (obstacles)

The same SVG shape is reused across the three obstacle severities. The
consumer paints it with one of:

- `var(--color-obstacle-mild)` — `#b0832e` (light) / `#d6b068` (dark)
- `var(--color-obstacle-difficult)` — `#b05b1a` / `#e0925a`
- `var(--color-obstacle-blocking)` — `#8d2818` / `#e07b69`

Aids use a single hue:

- `var(--color-aid)` — `#2f7a2e` / `#84b377`

## Sizing

- Default render size: **40×40 px** (≥ DEC-015's 24×24 minimum, with
  headroom for high-DPI scaling and easy touch acquisition).
- At cluster zoom levels, MapLibre will scale down via
  `icon-size`; do not drop below `24` (effective px) or the inner glyph
  becomes illegible.
- Always paired with the parallel list view label (M1-F09) — the marker
  is never the sole channel.

## Iteration note

These v1 glyphs are minimum-viable silhouettes. Refinement passes (more
expressive icons, optical centering, hairline tuning for low-DPI) are
expected — and cheap, because each marker is one self-contained SVG with
no cross-references.
