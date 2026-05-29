# Prompt: Build the route-level category summary strip (DEC-024 Phase 1)

## Role

You are a senior frontend engineer with strong accessibility chops,
comfortable with React, Next.js App Router, MapLibre GL JS, and the existing
Scout patterns. You implement **DEC-024 Phase 1** — the supports/obstacles
summary strip, the cluster-bubble copy improvement, and the first-visit
inline explainer — entirely in `apps/web/`.

This is a focused product enhancement. No backend or schema work, no new
API endpoints, no new dependencies (unless explicitly justified per
`AGENTS.md`).

## Inputs (read these before writing code)

1. **`AGENTS.md`** (root) and **`apps/web/AGENTS.md`** — conventions. Pay
   particular attention to: no global state libs, jest-axe assertions in
   unit tests, semantic design tokens (no raw hex), MapLibre not Mapbox,
   the voice-guide rule, and the mock-visibility rule (#3).
2. **`docs/03-decisions.md` `DEC-024`** — the binding decision this prompt
   implements. Especially the Phase 1 list and the consequences list.
   Phase 2 is **explicitly out of scope** for this PR.
3. **`docs/03-decisions.md` `DEC-009`** (a11y baseline), **`DEC-010`**
   (disclaimer / onboarding pattern; `localStorage` namespace you must
   reuse for the explainer flag), **`DEC-015`** (visual design system;
   shape families for markers), **`DEC-021`** (voice & copy is binding).
4. **`docs/contributor/voice-and-copy.md`** — especially §3 (reading
   level: microcopy FK ≤ 6), §6 (house words: **"support"** preferred
   over "aid"; **"obstacle"** preferred over "barrier" except for the
   DC-dataset term of art), and §7.3 (field labels and help text).
   Every user-facing string you add must conform.
5. **`docs/02-prd.md` §6.1**:
   - `M1-F08` — feature rendering on map (you are extending it).
   - `M1-F09` — parallel list view (you filter into it).
   - `M2-F19` — toggle layers without re-routing (you partly deliver it).
6. **Existing components you will read or modify:**
   - `apps/web/components/PlanExperience.tsx` — layout host; lifts state
     for the strip.
   - `apps/web/components/BasemapInner.tsx` — MapLibre cluster config;
     cluster-bubble copy and per-category visibility live here.
   - `apps/web/components/FeatureListView.tsx` — the existing list view;
     the strip's filter button targets it.
   - `apps/web/components/FeatureMarker.tsx` — current marker rendering
     and the shape-family pattern to reuse for chip icons.
   - `apps/web/components/OnboardingModal.tsx` — read this only to find
     the existing `DEC-010` `localStorage` namespace; reuse it for the
     explainer flag. Do **not** invent a new namespace.
   - `apps/web/components/ProfileCategoryFields.tsx` — existing category
     UI; confirms category labels and the `ApiCategory` shape.
   - `apps/web/lib/api.ts` — `ApiCategory`, route-features response
     types.
   - Look for an existing `<LiveRegion/>` (or equivalent
     `aria-live="polite"` host) in `apps/web/components/`. Reuse it if
     present; only create one if it genuinely doesn't exist.

## What to build

### 1. New component: `RouteCategorySummary.tsx`

Path: `apps/web/components/RouteCategorySummary.tsx`. Marked
`"use client"` (it's interactive).

**Inputs (props).**

- The route's features (already fetched by `PlanExperience.tsx`).
- The list of `ApiCategory` (each with `kind ∈ {aid, obstacle}`,
  `id`, `label`, icon shape).
- `filterCategoryId: string | null` and `onFilterChange(id: string | null): void`.
- `hiddenCategoryIds: ReadonlySet<string>` and
  `onMapVisibilityChange(id: string, visible: boolean): void`.

**Output.**

A `<section aria-labelledby="route-summary-heading">` whose visible
heading is screen-reader-only (`sr-only`). Inside, two
`<div role="group">` blocks:

```
Supports          (role="group", aria-labelledby="route-supports-heading")
  [chip] [chip]   each chip is two <button>s (filter + visibility)
Obstacles         (role="group", aria-labelledby="route-obstacles-heading")
  [chip] [chip]
```

Section headings render visually as **"Supports"** and **"Obstacles"**
(per `DEC-024` and the voice guide §6 — never "Aids").

**Per-chip rules.**

- Render only categories that have ≥ 1 feature on this route. Empty
  categories don't get chips.
- Counts are computed by grouping the route's features by
  `categoryId`. Counts are **authoritative** for "what's on the
  route" — they never reflect map-visibility state.
- Each chip is the composition of:
  - **Outer `<button aria-pressed={filterCategoryId === category.id}>`**.
    Click toggles the filter (`onFilterChange(category.id)` on press;
    `onFilterChange(null)` to clear).
    Visible content: category icon (reuse the shape-family component
    from `FeatureMarker.tsx`), label, count.
    `aria-label`: `"<count> <label> along this route"` —
    e.g. `"12 curb ramps along this route"`. Full phrase, never bare
    number.
  - **Inner `<button aria-pressed={hiddenCategoryIds.has(category.id)}>`**
    with an eye / eye-off icon. Click calls
    `onMapVisibilityChange(category.id, !hiddenCategoryIds.has(category.id))`.
    `aria-label` toggles between
    `"Hide curb ramps from map; 12 along route"` and
    `"Show curb ramps on map; 12 along route"`.

**Tab order within a chip.** Outer filter button first, then inner
visibility button. This means a keyboard user reading left-to-right
encounters category, then per-category map control.

**Touch targets.** Both buttons satisfy WCAG 2.5.5 (≥ 44 × 44 px). The
inner eye button must remain large enough to satisfy this on its own —
do not rely on the outer chip swallowing accidental taps.

**Tests** in `RouteCategorySummary.test.tsx`:

- Renders both sections; only categories present in input get chips.
- Counts are correct for representative input (parameterized).
- Filter button toggle: `aria-pressed` flips; `onFilterChange` called
  with the right id (or `null` on second press).
- Visibility button toggle: `aria-pressed` flips;
  `onMapVisibilityChange` called with `(id, true | false)` correctly.
- jest-axe: `expect(await axe(container)).toHaveNoViolations()`.
- Keyboard tab order: supports section before obstacles section; within
  each section by chip order; within each chip [filter, visibility].

### 2. Wire into `PlanExperience.tsx`

- Place `<RouteCategorySummary/>` between the route summary header and
  `<FeatureListView/>`.
- **Lift state** for `filterCategoryId: string | null` and
  `hiddenCategoryIds: Set<string>` into `PlanExperience.tsx`. Pass
  them down to both `<RouteCategorySummary/>` and the list view / map.
- **Filter behavior.** When `filterCategoryId !== null`,
  `<FeatureListView/>` shows only matching features. The map is
  unaffected by the filter — only by the visibility toggles.
- **Visibility behavior.** When `hiddenCategoryIds.has(c.id)`, the
  map's marker layer for that category is hidden (see §3c). The list
  view is unaffected by visibility.
- **No new state library.** React `useState` + props is sufficient.
  Per `apps/web/AGENTS.md`, do not add Redux / Zustand / etc.
- **`aria-live="polite"` announcement** on filter change. Find or
  reuse a `<LiveRegion/>` in `apps/web/components/`. Announcement
  copy when filter is set: e.g. `"Filtered to curb ramps. 12 along
  route."`. When cleared: `"Filter cleared. Showing all features."`.
  Both at FK ≤ 6.

### 3. Update `BasemapInner.tsx`

**(a) Cluster-bubble copy.** Today the cluster bubble shows just the
count. Update so:

- Single-category cluster: `"5 curb ramps · zoom in"` (use the
  category's user-facing label).
- Multi-category cluster: `"5 features · zoom in"`.

Recommended approach: define `clusterProperties` on the GeoJSON source
to maintain per-category counts on each cluster
(`['+', ['case', ['==', ['get', 'category'], 'curb_ramps'], 1, 0]]`,
etc.). Then derive the dominant category in the layer's `text-field`
expression. If `clusterProperties` proves clumsy for the dominant-vs-
multi distinction, fall back to a JS-side computation in the cluster
click / hover handler — but precompute on the source where possible
for frame-rate reasons.

**(b) Cluster screen-reader text on focus.** `M1-F08` already
specifies "cluster count is announced on focus." Extend that
announcement to spell the category mix:
`"cluster of 5: 3 curb ramps, 2 obstacles; press Enter to zoom"`.
Use the `<LiveRegion/>` for the announcement.

**(c) Per-category visibility.** When a user toggles the eye-icon on
a chip, the corresponding category's markers must hide. Two viable
approaches; pick whichever is simpler given the current layer
structure:

- One layer per category, toggled with
  `setLayoutProperty(layerId, 'visibility', 'none' | 'visible')`.
- One markers layer with a filter expression keyed off the
  `hiddenCategoryIds` set.

Keep the cluster layer responding to the same visibility — a hidden
category should not contribute to its cluster's count.

### 4. First-visit inline explainer

Above the summary strip on the first route render of a session.

- **Not a modal.** Inline `<aside>` or `<div role="status">` (your
  call — pick whichever the existing pattern in the codebase uses).
  `DEC-010` already owns modal surface; do not add another.
- **Copy.** *"Each marker is a separately inspected feature. Multiple
  markers at one corner mean the corner was inspected multiple times,
  not that data is duplicated."* Test it lands at FK ≤ 6.
- **Dismiss button** with `aria-label="Dismiss explainer"`. Touch
  target ≥ 44 × 44 px.
- **Persistence.** Store the dismissal flag in `localStorage`. Reuse
  the existing `DEC-010` namespace (find it in
  `OnboardingModal.tsx`) — do not invent a new top-level key. Suggested
  flag name within that namespace: `markerDensityExplainerDismissed`.
- **Reduced motion.** Honor `prefers-reduced-motion` — no animation
  on dismissal if it's set.
- **Tests.** Shows on first render; doesn't show after dismissal;
  dismissal persists across remounts (mock `localStorage`).

### 5. PRD edits in the same PR

Per the `AGENTS.md` doc-hygiene rule:

- **`docs/02-prd.md` `M1-F08`.** Add an acceptance bullet: *"A
  route-level category summary strip displays the supports and
  obstacles present on the route as filterable, individually-
  hideable chips with counts. See `DEC-024`."*
- **`docs/02-prd.md` `M2-F19`.** Update the description to reflect
  that the per-category eye-toggle in the summary strip absorbs
  the runtime layer-toggle behavior. If nothing meaningful remains
  of `M2-F19` after that, mark it as superseded by the Phase 1
  ticket (cite this prompt's PR). If something does remain (e.g.
  a separate filter affordance outside the strip, or
  cross-category bulk toggles), narrow `M2-F19` to that remainder.

## Voice and copy specifics

- Section headings: **"Supports"** and **"Obstacles"**. Do not write
  "Aids" — that's the `kind` enum value, not user-facing language.
- Count phrasing in `aria-label`: full phrase, e.g. `"12 curb ramps
  along this route"`, not just the number.
- Eye-toggle `aria-label`s: see §1 above.
- Cluster copy: see §3a / §3b above.
- Explainer copy: see §4 above.
- Reading level: microcopy FK ≤ 6 (`DEC-009` and voice guide §3).
  Run a check on each new string before committing.

## Accessibility (must pass jest-axe and Playwright axe)

- `role="group"` with `aria-labelledby` on the supports and
  obstacles wrappers.
- Both chip buttons are real `<button>` elements with `aria-pressed`
  reflecting state.
- Touch targets ≥ 44 × 44 px on every interactive element, including
  the inner eye button and the explainer dismiss button.
- Focus indicators ≥ 3:1 contrast (`DEC-015`), visible on every
  interactive element.
- `aria-live="polite"` announcement on filter changes (see §2) and on
  cluster focus (see §3b).
- `prefers-reduced-motion` honored on chip transitions and explainer
  dismissal.
- The summary strip is in the keyboard tab order **before** the map,
  matching the screen-reader-first ordering already used by
  `M1-F09`'s list view.

## Don't

- Don't add a state library (Zustand / Redux / MobX / Recoil).
- Don't import from `apps/backend/`. Contract is the HTTP API.
- Don't reverse `DEC-024`. If you find a real reason to differ, open
  `docs/proposals/DEC-024-followup.md` and stop, per `AGENTS.md`
  rule #4.
- Don't ship Phase 2 work in this PR. The backend
  `intersection_cluster_id` migration, the
  `aggregate_by=intersection_cluster` API mode, and the
  badge-and-expand intersection markers are explicitly deferred.
- Don't change `category.id` values. They're persisted in
  `localStorage` per `M1-F06`.
- Don't add new dependencies without a one-sentence justification in
  the PR description (per `AGENTS.md`).
- Don't introduce a new `localStorage` top-level namespace for the
  explainer; reuse the existing `DEC-010` one.

## Mocks

If you mock anything (e.g., `localStorage`, `IntersectionObserver`,
MapLibre's `Map` class for unit tests), follow `AGENTS.md` rule #3:

- Comment the mock site `// MOCK: <what and why>`.
- List every mock in the PR description under a "Mocks introduced"
  heading.

## Deliverable

A single PR titled
`feat(web): route-level category summary strip (DEC-024 Phase 1)`
containing:

- New `apps/web/components/RouteCategorySummary.tsx` and its
  `.test.tsx`.
- Modifications to `apps/web/components/PlanExperience.tsx`,
  `BasemapInner.tsx`, and the tests they have.
- New first-visit explainer (component or inline, your call) and its
  tests.
- Playwright E2E coverage: keyboard-only navigation through the
  strip, filter toggle, eye-toggle, axe scan of the planner route,
  mobile viewport (375 px).
- PRD edits to `M1-F08` and `M2-F19` in `docs/02-prd.md`.
- A PR description with:
  - Tickets closed (Phase 1 ticket id assigned by PRD owner; cite
    `DEC-024`).
  - Decisions touched (`DEC-024`, `DEC-009`, `DEC-015`, `DEC-021`).
  - Mocks introduced.
  - Screenshots of the strip in: default state (filter off, all
    visible), filter active state, with one category hidden, and
    explainer-dismissed state.

If you discover ambiguity in `DEC-024` or in this prompt, raise it
before writing code. One question costs less than one iteration.
