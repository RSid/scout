# Prompt: Produce the Scout M1 design system

> **Status:** The output of this prompt has merged. It supersedes the
> palette fallback in `prompts/03-scaffold-frontend-m1.md`. The resulting
> design system lives at `apps/web/design/`.

## Role

You are a senior product designer with deep experience in accessibility-first
products and in working alongside disabled co-designers. You are *collaborative*
with the project owner — they have explicit aesthetic preferences they will
share with you, and your job is to translate those preferences into a
production-ready, WCAG-compliant design system, not to autonomously decide the
look of the product.

## Inputs (read these before starting)

- `docs/01-one-pager.md` — voice, tone, audience.
- `docs/02-prd.md` §5 (user flows), §6.1 (M1 ticket list), §7.1 (a11y NFRs).
- `docs/03-decisions.md` — especially **DEC-009** (WCAG target), **DEC-010**
  (disclaimer pattern), **DEC-013** (i18n implications for line length),
  **DEC-015** (this work item — read it twice; the constraints there are
  non-negotiable).

## How to collaborate

1. **Start by asking the owner about aesthetic intent.** Concrete prompts:
   - Three adjectives that should describe how the app *feels* (e.g., "calm,
     trustworthy, no-nonsense" vs. "warm, community, hopeful").
   - One or two existing products whose visual feel they admire, and one or two
     they want to avoid feeling like.
   - Any color associations they want or want to avoid (e.g., red = danger,
     fine? or red = "scary" and they want softer warnings?).
   - Whether they want a logo / wordmark in M1 or text-only.
   - Stance on dark mode (auto / always-on / opt-in / not yet).
2. **Lock the non-negotiable constraints** (from DEC-015) before sketching:
   contrast ratios, color-blind verification, focus indicator contrast, target
   sizes, motion preferences, shape-not-just-color, self-hosted typography.
3. **Propose options where there is genuine creative latitude.** Show two or
   three directions for the color palette, marker shape system, and primary
   typography. Have the owner pick.

## What to produce

A single PR adding `apps/web/design/` with:

```
apps/web/design/
├── README.md                  # overview + how to use the tokens
├── tokens/
│   ├── colors.css             # CSS custom properties, light + dark, with
│   │                           contrast ratios commented inline
│   ├── colors.ts              # TypeScript export of the same, typed
│   ├── typography.css         # font-family stack (self-hosted), scale, line-height
│   ├── spacing.css            # spacing + radius + elevation scales
│   └── motion.css             # easing + duration; honors prefers-reduced-motion
├── markers/                   # SVG sprite for map markers
│   ├── obstacle/*.svg         # one shape family
│   ├── aid/*.svg              # another shape family
│   └── README.md              # which marker maps to which category
├── components/                # static HTML+CSS pattern reference
│   ├── button.html
│   ├── input.html
│   ├── combobox.html
│   ├── modal.html
│   ├── popover.html
│   ├── list-item-details.html
│   ├── banner.html
│   ├── chip.html
│   └── toggle.html
├── screens/                   # static mockups (HTML or SVG) for key screens
│   ├── landing.html
│   ├── plan-default.html
│   ├── plan-with-route.html
│   ├── preferences-modal.html
│   └── onboarding-modal.html
└── audit/
    └── contrast-report.md     # every color combo + measured ratio + pass/fail
```

## Required deliverables in detail

### Color tokens

- Two themes: light, dark. Auto-switch via `prefers-color-scheme`.
- Semantic role names: `--color-surface`, `--color-surface-elevated`,
  `--color-text`, `--color-text-muted`, `--color-border`, `--color-focus-ring`,
  `--color-link`, `--color-link-visited`, plus category-specific:
  `--color-aid`, `--color-obstacle-blocking`, `--color-obstacle-difficult`,
  `--color-obstacle-mild`.
- For each combination that appears in the UI, list the WCAG contrast ratio in
  a comment, and verify with a tool (`https://webaim.org/resources/contrastchecker/`
  or equivalent).
- Run the proposed palette through a protanopia / deuteranopia / tritanopia
  simulator (e.g., Sim Daltonism, Adobe Color CB). Document the simulation
  results in `audit/contrast-report.md`.

### Typography

- Self-hosted font (Inter, Atkinson Hyperlegible, or similar — Atkinson is
  specifically designed for low-vision readability; consider it).
- Type scale (e.g., 12 / 14 / 16 / 18 / 24 / 32 / 48), each with a recommended
  line-height.
- Max measure for body copy: 65–75 characters (cognitive accessibility).
- Avoid all-caps in body text. Avoid italics in body text.

### Marker shape system

- Two clearly distinct shape families:
  - **Obstacles**: angular / hard-edged (e.g., triangle, diamond, hexagon).
  - **Aids**: soft / rounded (e.g., circle, rounded square).
- Within each family, sub-shapes or icons differentiate categories. Each is
  uniquely identifiable in black-and-white print.
- Size: minimum 24×24 px at default zoom; scales with zoom level.
- Always paired with a text label in the parallel list view (M1-F09).

### Focus indicator

- 3 px minimum, ≥ 3:1 contrast against the focused element AND against the
  surrounding background (WCAG 2.4.13).
- Same indicator everywhere (no per-component focus styles).
- Visible on both light and dark themes.

### Mockups

Each screen mockup is a static HTML or SVG file the engineering agent can
reference visually. Show:

- Default state, hovered state, focused state, disabled state where applicable.
- Mobile (375 px) and desktop (1280 px) variants for the two `plan-*` screens.
- The onboarding modal mockup must include the disclaimer text in its final
  copy (or at least placeholder paragraphs of the correct visual weight).

## Hand-off to the frontend agent

When this design pass merges, update `prompts/03-scaffold-frontend-m1.md` to
remove its "use IBM color-blind-safe palette" fallback and instead reference
the new `apps/web/design/tokens/` files. (Add a one-line note at the top of
this prompt saying "supersedes the palette fallback in
prompts/03-scaffold-frontend-m1.md.")

## Don't

- Don't choose a font from Google Fonts (privacy + offline). Self-host.
- Don't ship colors without a recorded contrast ratio for every use.
- Don't introduce a brand mark unless the owner asks for one in M1.
- Don't gate any required interaction behind hover-only interactions.
- Don't use carousels, autoplaying video, or any motion that can't be paused.
- Don't include third-party assets (Lottie, illustration packs) without a
  license-compatibility check against AGPL-3.0.

## Deliverable

A working `apps/web/design/` plus an updated
`docs/prompts/03-scaffold-frontend-m1.md` that points at the tokens.
Commit message: `design: M1 design system per DEC-015`.
