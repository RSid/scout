# Scout design system

The visual design layer for `apps/web/`. Tokens, markers, and reference
mockups produced by the design pass per **DEC-015**.

Conventions follow the prompt at `docs/prompts/07-design-system.md` and
the non-negotiable constraints in DEC-015. This system supersedes the
IBM-color-blind-safe palette fallback that previously lived in
`docs/prompts/03-scaffold-frontend-m1.md`.

## Status — v1

The v1 palette is **Direction B "Civic warm"** (rust accent + cream
surface + forest aid + brick severity ramp). The project owner picked
this from a comparison of three directions; their note at hand-off was
that they were "feeling mid" on all three and that v1 is a starting
point to iterate from. **Palette iteration is expected** and is a
one-file edit:

- Light theme: `tokens/colors.css` (`:root` and `[data-theme="light"]`)
- Dark theme: `tokens/colors.css` (`@media (prefers-color-scheme: dark)` and `[data-theme="dark"]`)
- The TypeScript mirror in `tokens/colors.ts` must stay in sync if it
  changes (it's only used by audit tooling and Storybook-style
  documentation; production code reads CSS variables).

Marker shapes, focus indicator, typography, spacing, and motion are
**locked** by DEC-015 constraints (shape-not-color, ≥ 3:1 focus ring,
44 px target minimum, `prefers-reduced-motion` honored, self-hosted
typography). Iterating those requires a new DEC.

## Folder layout

```
apps/web/design/
├── README.md                    ← this file
├── tokens/
│   ├── index.css                ← single-import entry point
│   ├── colors.css               ← semantic color tokens (light + dark)
│   ├── colors.ts                ← typed mirror for design-time tooling
│   ├── typography.css           ← @font-face + scale + line-height
│   ├── spacing.css              ← spacing, radius, elevation, target size, z-index
│   └── motion.css               ← durations, easings, prefers-reduced-motion reset
├── markers/
│   ├── README.md                ← shape system explained
│   ├── obstacle/                ← triangle / diamond / hexagon
│   │   ├── curb_ramps.svg
│   │   ├── barriers.svg
│   │   └── audible_signals.svg
│   └── aid/                     ← circle / rounded square / pill
│       ├── restrooms.svg
│       ├── rest_spots.svg
│       └── water_cooling.svg
├── screens/
│   ├── plan-with-route.html     ← composite — mobile (375 px) + desktop (1280 px)
│   └── onboarding-modal.html    ← DEC-010 disclaimer copy in final form
├── fonts/
│   └── README.md                ← how to fetch Atkinson Hyperlegible self-hosted
└── audit/
    └── contrast-report.md       ← every pair, every ratio, every CVD risk pair
```

## How the frontend consumes this

`apps/web/AGENTS.md` is the binding contract. Quick reference:

```ts
// Components reference semantic tokens via CSS, NOT raw hex:
<div className="text-[var(--color-text)] bg-[var(--color-surface)]" />

// For inline styles (MapLibre paint specs, programmatic SVG fills):
import { colorVar } from "@/design/tokens/colors";
const fill = colorVar("obstacle-blocking"); // "var(--color-obstacle-blocking)"

// One import covers the whole token layer:
// in app/globals.css —
//   @import "@/design/tokens/index.css";
```

The token names are stable. Palette swaps don't require component edits.

## Markers — short version

- Obstacle markers use **angular** shapes (triangle / diamond / hexagon).
- Aid markers use **rounded** shapes (circle / squircle / pill).
- Shape encodes **category**. Color encodes **severity** (for obstacles)
  or **aid status** (for aids). White ring + white inner glyph are baked
  into the SVG for legibility against any basemap.
- Author SVGs use `fill="currentColor"` on the outer shape — consumer
  sets `color` to a severity / aid token at render time.

Full mapping table and rendering notes in `markers/README.md`.

## Typography — short version

- Family: **Atkinson Hyperlegible** (Braille Institute, SIL OFL).
  Self-hosted under `apps/web/public/fonts/`. Fetch via
  `scripts/fetch_fonts.sh` before `pnpm dev`. **No Google Fonts CDN**
  (NF-PRIV-01).
- Scale: `--font-size-{xs|sm|base|lg|xl|2xl|3xl}` corresponding to
  12 / 14 / 16 / 18 / 24 / 32 / 48 px.
- Body line-height: `--line-height-normal` (1.55). Headings:
  `--line-height-tight` (1.15).
- Body max measure: `var(--measure-body)` = 65 ch (DEC-013 i18n
  tolerance).
- Weights: 400 (regular) and 700 (bold) only — italics are downloaded
  but used sparingly; avoid italic body copy.

## Reference screens

`screens/plan-with-route.html` and `screens/onboarding-modal.html` are
static HTML reference mockups. They use the _actual_ tokens via
`@import "../tokens/index.css"`, so any palette change in `tokens/`
reflects in the mockup on next page load. They are not part of the
production bundle — they're a visual hand-off for the frontend agent.

Open them in any modern browser (Chrome / Safari / Firefox) by
double-clicking the files. Fonts will fall back to the system stack
since `/fonts/AtkinsonHyperlegible-*.woff2` isn't served from the
local filesystem.

## Iteration playbook

When iterating on the palette:

1. Edit `tokens/colors.css`. Keep the semantic role names — only the
   hex values change.
2. Update `tokens/colors.ts` to match. The audit script can diff these
   to catch drift.
3. Re-run the contrast audit. Run every pair from
   `audit/contrast-report.md` through the WebAIM Contrast Checker
   (<https://webaim.org/resources/contrastchecker/>). Any pair that
   crosses a threshold gets updated in the report (don't delete history;
   amend with a "v2:" line).
4. Re-render `screens/*.html` mentally (they auto-pick up the new tokens
   via `@import`).
5. Run any CVD simulator against the screen mockups (Sim Daltonism on
   macOS, Color Oracle cross-platform). Look for distinguishability of
   the severity ramp and aid-vs-obstacle pairs.
6. Update this README's "Status — v1" section to note "v2: <date> —
   <one-line rationale>".

Iteration changes do not require a new DEC. A _new marker shape system_
or a _new typeface_ does require one.

## See also

- `docs/03-decisions.md` — DEC-009 (WCAG target), DEC-010 (disclaimer),
  DEC-015 (this design system).
- `docs/02-prd.md` §7.1 — Accessibility NFRs.
- `docs/appendix-data-schema.md` §B — canonical category list driving
  the marker set.
- `apps/web/AGENTS.md` — frontend conventions for consuming these
  tokens.
