# Prompt: Scaffold the M1 Next.js frontend

## Role

You are a senior frontend engineer with deep accessibility (WCAG 2.2 AA) expertise.
You scaffold a Next.js 15 App Router application that satisfies the M1 frontend
tickets in the Scout PRD.

## Inputs (read these before coding)

- `docs/02-prd.md` §6.1 (M1 tickets, especially F01, F02, F03, F05, F06, F08, F09,
  F10, F14) and §7.1 (Non-functional accessibility requirements).
- `docs/03-decisions.md` DEC-001, DEC-002, DEC-009, DEC-010, DEC-013, **DEC-015
  (design system runs in parallel)**, DEC-016, **DEC-020 (vendor-agnostic
  adapters apply on the frontend too where the FE makes external calls)**.
- `docs/appendix-data-schema.md` (the Feature shape you consume from the API).
- `docs/01-one-pager.md` (voice and tone).

## Design tokens — produced by the design pass (DEC-015)

The design pass (`docs/prompts/07-design-system.md`) has merged. Do not
recreate or invent tokens; consume what is already at `apps/web/design/`:

- `apps/web/design/tokens/index.css` — single-import entry point. Add
  `@import "@/design/tokens/index.css";` to `app/globals.css`.
- `apps/web/design/tokens/colors.css` — semantic role names (`--color-surface`,
  `--color-text`, `--color-text-muted`, `--color-accent`, `--color-link`,
  `--color-focus-ring`, `--color-aid`, `--color-obstacle-{mild,difficult,blocking}`,
  `--color-warning-{surface,border,text}`, etc.), with light + dark variants
  driven by `prefers-color-scheme` and a manual `[data-theme=…]` opt-in.
- `apps/web/design/tokens/colors.ts` — typed mirror (`colorVar("accent")`
  returns `"var(--color-accent)"`). Use for MapLibre paint specs and
  programmatic SVG fills. **Never inline raw hex in components.**
- `apps/web/design/tokens/typography.css` — `@font-face` for Atkinson
  Hyperlegible (self-hosted; run `scripts/fetch_fonts.sh` before
  `pnpm dev` on a fresh clone), type scale, line-heights, max measure.
- `apps/web/design/tokens/spacing.css` — `--space-*`, `--radius-*`,
  `--elevation-*`, `--target-min` (44 px), focus-ring width + offset,
  `--z-*` ladder.
- `apps/web/design/tokens/motion.css` — durations, easings, and the
  `prefers-reduced-motion` universal reset.

Marker SVGs at `apps/web/design/markers/` — six shapes for the M1
default-on categories (obstacle family: triangle / diamond / hexagon;
aid family: circle / squircle / pill). Each authored with
`fill="currentColor"` so the consumer paints with a severity / aid token.
The MapLibre sprite is built from these source SVGs at scaffold time.

Reference mockups at `apps/web/design/screens/`:
`plan-with-route.html` (mobile 375 px + desktop 1280 px composite) and
`onboarding-modal.html` (final DEC-010 disclaimer copy). Implement the
React components to match these mockups visually; tokens guarantee the
palette propagates without inline hex.

Contrast audit at `apps/web/design/audit/contrast-report.md` — every
pair with measured ratio + AA/AAA verdict + CVD risk-pair analysis.
The audit notes one known follow-up: implement the **double-ring focus
style** on the dark-mode accent button (a single sunshine ring fails
the focus-on-element criterion against the warmed-rust dark-mode accent
fill at 1.4:1). The plan-view mockup demonstrates the resting style;
the frontend scaffold must add the second 1 px `surface` stripe inside
the outer ring for accent buttons in dark mode.

## What to build

Create `apps/web/` with this layout:

```
apps/web/
├── package.json
├── next.config.ts
├── tsconfig.json              # strict
├── tailwind.config.ts
├── postcss.config.js
├── playwright.config.ts
├── vitest.config.ts
├── app/
│   ├── layout.tsx             # base shell, skip-link, lang attribute, banner
│   ├── page.tsx               # landing (SSR, no JS needed)
│   ├── about/page.tsx         # disclaimer anchor lives here
│   ├── privacy/page.tsx
│   ├── plan/page.tsx          # main route-planning view
│   └── api/                   # only used as a proxy if needed; default: none
├── components/
│   ├── BasemapView.tsx        # MapLibre + PMTiles
│   ├── FeatureMarker.tsx
│   ├── FeatureListView.tsx    # the parallel non-map view
│   ├── ProfilePanel.tsx       # the accessibility-preferences modal
│   ├── AddressAutocomplete.tsx
│   ├── RouteSummary.tsx
│   ├── DisclaimerBanner.tsx
│   ├── OnboardingModal.tsx
│   └── a11y/
│       ├── SkipLink.tsx
│       ├── FocusTrap.tsx       # if @react-aria/focus isn't used
│       └── LiveRegion.tsx
├── lib/
│   ├── api.ts                  # typed client for the FastAPI endpoints
│   ├── profile.ts              # localStorage-backed profile state
│   ├── geo.ts                  # bbox/distance helpers
│   └── i18n/                   # next-intl scaffolding
├── public/
│   ├── tiles/dc.pmtiles        # produced by scripts/build_pmtiles.sh
│   └── manifest.webmanifest
├── tests/
│   ├── unit/                   # Vitest + RTL + jest-axe
│   └── e2e/                    # Playwright + @axe-core/playwright
└── README.md
```

## Required behaviors and patterns

### Layout / shell

- `app/layout.tsx` sets `<html lang="en">` (i18n-aware in M2 — for M1 lock to
  `en`).
- Includes a `<SkipLink/>` as the first focusable element ("Skip to main content").
- Includes the `<DisclaimerBanner/>` (per DEC-010).
- Wraps children in a `<LiveRegion/>` for `aria-live` announcements
  (route loaded, profile changed, etc.).

### Map view (`<BasemapView/>`)

- Uses `maplibre-gl@^4`, dynamically imported (`next/dynamic` with `ssr: false`).
- Loads `pmtiles://` source from `/tiles/dc.pmtiles` via the `pmtiles` JS package.
- Sets `keyboard: true` on the map, exposes `+`/`-` controls that are
  Tab-focusable.
- Renders the route LineString as a styled layer with sufficient contrast
  (use `data-driven` styles only where necessary).
- Renders features as symbol layers using **shape AND color** to differentiate
  obstacles from aids (DEC-015 palette; pre-loaded SVG sprites).
- Clusters features at low zoom.
- Pop-ups open on click *and* on `:focus`; close with `Escape`.

### Parallel list view (`<FeatureListView/>`)

- Renders below the map at desktop ≥ 768 px; *above* the map (primary view) at
  < 768 px.
- Each item is a `<details>` whose `<summary>` text reads:
  `"<icon> <CategoryLabel> · <Condition> · ~<N> m from start"`.
- Expand reveals: full description, inspected year, freshness chip per
  `appendix-data-schema.md` §D, and a button "Show on map" that focuses the
  marker.

### Profile panel (`<ProfilePanel/>`)

- Modal dialog (`role="dialog" aria-modal="true"`), focus trapped, `Escape`
  closes, focus returns to trigger.
- Checkboxes for each category from `GET /api/categories`. Default-enabled per
  the API.
- "Reset to defaults" and "Save" buttons.
- State persisted to `localStorage` under key `scout.profile.v1`.

### Address autocomplete (`<AddressAutocomplete/>`)

- Implements the WAI-ARIA combobox pattern (1.2 authoring practices).
- Debounces 500 ms; max 1 request/sec to Nominatim (server-side proxy if needed
  to share a rate budget — talk to the backend agent about a `/api/geocode`
  endpoint if it's not in M1 — for M1 it's OK to call Nominatim directly with
  the client-side debounce).
- "Use my location" button calls `navigator.geolocation` only on click.

### Onboarding modal (`<OnboardingModal/>`)

- Renders on first visit (no `scout.onboarded.v1` in `localStorage`).
- Explains the app in 3 short paragraphs; includes the disclaimer text; surfaces
  the Profile panel inline so user picks categories before dismissing.
- Dismissal sets `scout.onboarded.v1=true`.

### Accessibility patterns (apply everywhere)

- **Color is never the sole signal.** Pair every color cue with a shape, icon,
  or label.
- **Focus visible.** Use Tailwind's `focus-visible:` utilities or a global
  `:focus-visible` style with ≥ 3:1 contrast.
- **`prefers-reduced-motion: reduce`** disables all map flyTo animations, panel
  transitions, and toast slide-ins.
- **`prefers-color-scheme: dark`** supported (DEC-015 palette has dark-mode
  variants).
- **Min target size** ≥ 44×44 px (WCAG 2.5.5).
- **Form errors** are inline, programmatically associated via `aria-describedby`,
  and announced via the `<LiveRegion/>`.
- **`@react-aria/`** or **Radix UI** primitives for the Dialog and Combobox —
  do not hand-roll focus management.

### Tests

- **Unit**: Vitest + RTL + `jest-axe` (no axe violations on rendered components).
  Aim for 80%+ coverage on `components/` and `lib/`.
- **E2E**: Playwright + `@axe-core/playwright`. At minimum:
  - happy path: plan a known DC route, see features.
  - keyboard-only: navigate the entire happy path without a mouse.
  - screen-reader-friendly: assert presence of all required ARIA labels and
    live-region announcements.

## Don't

- Don't add Redux, MobX, Zustand, or any global state library. `localStorage` +
  React Context (for the Profile) is enough.
- Don't render the map server-side.
- Don't use Google Fonts as a runtime CDN (privacy + offline). The design pass
  self-hosts Atkinson Hyperlegible under `apps/web/public/fonts/`; populate via
  `scripts/fetch_fonts.sh`.
- Don't add analytics, telemetry, or any third-party script in M1.
- Don't use raw `mapbox-gl` — we use MapLibre (DEC-002).
- Don't add `next/image` for the map markers — use inline SVG sprite via MapLibre.

## Deliverable

A working `apps/web/` that:

- Boots locally with `pnpm dev`.
- Passes Vitest unit tests and Playwright E2E tests, both with axe checks.
- Lints clean with `eslint` + `prettier`.
- Builds to a static-ish export (Next.js `output: "standalone"` is fine).

Commit message: `feat(web): scaffold M1 Next.js app per PRD §6.1`.
