# DEC-024 (proposed) — UX treatment for route-feature marker density

**Status.** Draft proposal. Lives in `docs/proposals/` per the convention in
[`AGENTS.md`](../../AGENTS.md). Promote to `docs/03-decisions.md` as
`DEC-024` when Phase 1 implementation lands.

**Related decisions.** `DEC-009` (WCAG 2.2 AA), `DEC-015` (visual design
system; obstacle vs. aid shape families), `DEC-019` (PostGIS schema with
`kind` discriminator), `DEC-020` (adapter pattern), `DEC-021` (voice & copy).

**Related tickets.** Refines `M1-F08` (render features on map) and
`M1-F09` (parallel list view). Subsumes part of `M2-F19` (toggle layers
without re-routing). Phase 2 introduces a new ticket TBD on backend
intersection clustering.

---

## Context

While reviewing route renders, the project owner observed that aids and
obstacles often appear in dense clusters within a small physical area,
raising the concern that Scout might be storing duplicate records. A staff
engineering investigation
([summary in `docs/proposals/DEC-024-marker-clustering-ux.md` discussion
thread, prior chat]) confirmed:

- **The pipeline is duplicate-safe.** Every row is keyed by
  `{source_dataset}:{source_id}` (`apps/backend/scout/ingest/dc.py`,
  `apps/backend/scout/data/models.py:22`). Within each ADA dataset every
  `GIS_ID` and every `(lon, lat)` pair is unique except for one pair of
  rows in `ADA_Driveway.geojson` with null condition data — and `driveways`
  is `default_enabled = no` per `docs/appendix-data-schema.md` §B.5.
- **The corridor query is dedup-free by design.**
  `apps/backend/scout/data/store.py::corridor_features_geojson` returns
  every row inside `buffer_meters` for the enabled categories. There is no
  proximity collapse.
- **The "clustering" is a mix of two effects, both expected.**
  1. MapLibre's `clusterRadius: 50, clusterMaxZoom: 15` in
     `apps/web/components/BasemapInner.tsx` (per `M1-F08`'s "markers cluster
     at low zoom" acceptance criterion).
  2. Real geographic density at intersections — a 4-way signalized corner
     legitimately has up to 8 distinct curb-ramp inspection records,
     plus 2-4 audible-signal buttons, plus possibly a barrier or two,
     all inside a ~25 m radius. Bucketing source coords to ~11 m cells:
     ~28 % of populated cells contain 2-4 curb ramps.
- **There is no glanceable categorical summary today.** `<FeatureListView/>`
  exists, but it's optimized for ordered detail along the route, not for
  "what kinds of things are on this route?" at a glance. Users cannot
  answer that question without scrolling the list or zooming the map.

This DEC is therefore a UX decision about **how to communicate density and
category mix to users without implying duplication**, not a data-layer fix.

## Audience-driven framing

The owner confirmed the Phase 1 audience is **people with mobility
challenges, broadly construed** — not just wheelchair users, but also
walker/cane/crutches users, people with chronic pain or fatigue, MS,
older adults, post-surgical recovery, prosthetic users, and similar.

Two consequences for the design:

1. **Counts of obstacles function as a fatigue/effort signal**, not just
   information. Five barriers across a half-mile route is materially
   different from zero barriers, even if both are technically walkable.
   Obstacle counts should be visually prominent and persistent, not
   easily dismissed.
2. **The data already splits into "aids vs. obstacles"** at the schema
   level (`Feature.kind`, see `DEC-019`). The owner's own framing in
   the original investigation prompt — "aids and obstacles along their
   route" — and PRD §1 (definitions of *Aid* and *Obstacle*) confirm
   the binary. Any glanceable summary should preserve it.

## Options considered

### Option A — Intersection-aware aggregation + route-level summary

Two changes working together: (i) a route-level "aids vs. obstacles"
summary strip with category chips above the map, (ii) backend-materialized
intersection clusters that replace pixel-stacking past zoom 15 with
badge-and-expand markers (e.g. `ramp icon · 5`).

- **Pros.** Solves all four jobs-to-be-done (glanceable summary, reduced
  clutter, trust signal that counts ≠ duplicates, drill-down). Strongest
  a11y story (text-first summary). Adds natural filter affordance.
- **Cons.** Most engineering scope. Intersection grouping requires either
  frontend spatial clustering (cheaper, less stable across pans) or a
  backend `intersection_cluster_id` materialization (correct, requires
  new `DEC-NNN` and Alembic migration). Source data has 100 % `null`
  `INTERSECTION_ID` on curb-ramp and audible-signal rows, so any
  grouping must be derived spatially. Cross-category density at one
  corner remains visually busy until Phase 2 adds an
  intersection-popover.
- **Confidence.** ~80 % it solves the user pain meaningfully;
  ~50 % shippable cleanly in a single PR.

### Option B — Route-level summary + honest cluster copy (no map-data changes)

Ship only the top half of Option A: the route summary strip plus a copy
fix to MapLibre cluster bubbles (`8` → `8 curb ramps · tap to zoom`) and
a one-time first-visit explainer tooltip clarifying that co-located
markers are distinct field inspections, not duplicates.

- **Pros.** Cheap, frontend-only, low risk. Strip directly answers the
  "at a glance" question. Trust signal handled via copy. Reuses
  `<FeatureListView/>` as canonical drill-down — no new interaction
  pattern. Easy to A/B or roll back.
- **Cons.** Does not fix high-zoom pixel stacking. Users zooming to
  inspect a specific corner still see overlapping icons. Education-heavy
  (relies on tooltip readers). Cross-category density unaddressed.
- **Confidence.** ~85 % it improves the experience; ~60 % it fully
  resolves the original complaint.

### Option C — Targeted clutter fix at the marker layer only

Raise `clusterMaxZoom` (15 → 17) and add a "stack" treatment for any
remaining marker overlap past that zoom: small numbered badge or fan-out,
expand on tap/Enter, animation gated by `prefers-reduced-motion`. Lean
on existing `<FeatureListView/>` for "at a glance".

- **Pros.** Smallest surgical fix. Pure frontend change. Most directly
  attacks the stacking symptom.
- **Cons.** No glanceable categorical summary on the map; users must
  mentally scan the list view. Trust signal still ambiguous without
  copy. Doesn't help users who never zoom to street level. Stack-marker
  UX has a long edge-case tail (hit areas, ordering, drift, focus order).
- **Confidence.** ~70 % it reduces clutter at high zoom; ~40 % it fully
  addresses the "at a glance" requirement.

### Considered and rejected

- **Server-side spatial deduplication of "near-duplicate" rows.** Would
  hide legitimately-distinct inspection records (one pothole report ≠
  another at the same corner) and weakens the freshness signal that
  `NF-TRUST-02` depends on. Rejected.
- **Single-category-at-a-time mode (force the user to filter).** Too
  restrictive for the planning persona; the user explicitly wants a
  combined view at a glance.
- **Heatmap layer.** Loses category and condition information; conflicts
  with `DEC-015`'s shape-family discipline (color must not be the sole
  signal).

## Decision

**Phase 1 (now): Option B with the aids/obstacles split.**

1. **Route-level summary strip** above the map view, persistent at all
   zoom levels.
   - Two visually-distinct groupings, in order: **Aids** (e.g. curb
     ramps, audible signals, accessible bus stops, accessible restrooms)
     and **Watch out for** (e.g. barriers, poor-condition ramps, steep
     driveways).
   - Each grouping renders the M1 categories present *on this route*
     as chips. Each chip shows the category icon (per `DEC-015` shape
     family), the user-facing label, and the **count along the route**.
     Categories not present on the route do not get a chip.
   - The chip is **dual-purpose** — both legend and filter:
     - Tapping the chip surface filters the list view to that category.
     - A small, distinct **eye-icon affordance** inside each chip
       toggles the marker layer's visibility for that category on the
       map. The count remains visible on the chip regardless of map
       visibility — counts are authoritative for "what's on the route",
       independent of "what's currently drawn".
   - The "watch out for" grouping uses warning-family color tokens (per
     `DEC-015`). Color *reinforces* the grouping; the section heading
     and shape family carry the meaning per `DEC-009` / WCAG 1.4.1.
   - Voice and copy follows `DEC-021`. Section labels are "Aids" and
     "Watch out for" (not "Obstacles" — "watch out for" reads with less
     binary judgment, important when an "obstacle" can be a ramp in
     poor condition rather than something to avoid entirely).

2. **Cluster-bubble copy improvement.** MapLibre cluster labels include
   the dominant category and count, e.g. `5 curb ramps · zoom in`. When
   a cluster contains multiple categories, fall back to
   `5 features · zoom in`. Screen-reader text spells out the mix:
   `cluster of 5: 3 curb ramps, 2 barriers; press Enter to zoom`.

3. **First-visit explainer.** A one-time, dismissible inline note (not
   a modal — the disclaimer modal in `DEC-010` is enough modal surface
   already) appears above the strip on the first route render in a
   session: *"Each marker is a separately inspected feature. Multiple
   markers at one corner mean the corner was inspected multiple times,
   not that data is duplicated."* Stored in `localStorage` per
   `DEC-010`'s pattern.

**Phase 2 (next milestone, no fixed timeline): Option A's
intersection-clustering layer.**

4. Backend materializes an `intersection_cluster_id` column on
   `features` via spatial clustering (DBSCAN on `geom` with a
   tunable `eps`, default ~15 m) at ingest time. Migration is a new
   `DEC-NNN` with its own Alembic revision; this DEC reserves the
   commitment but does not specify the algorithm in detail.
5. The corridor API gains an optional
   `aggregate_by=intersection_cluster` mode returning one record per
   `(intersection_cluster_id, category)` with `member_count` and
   `member_ids[]`. Default mode (no aggregation) is unchanged.
6. Frontend marker layer at zoom > 15 swaps pixel-stacked markers for
   badge-and-expand markers. Tapping/focusing a badge opens an
   intersection popover listing the member features, each focusable
   in along-route order.
7. Phase 2 also extends the explainer from Phase 1 to mention the
   new intersection grouping.

Phase 1 ships independently and is fully usable. Phase 2 is layered on
top without breaking the Phase 1 contract.

## Why this choice

1. **The summary strip is the highest-leverage piece of the whole space.**
   It is the only element that answers "at a glance, what's on my route?"
   without zooming. It also doubles as the strongest accessibility
   surface — text-first, screen-reader navigable, keyboard-equivalent —
   which matters disproportionately for a mobility-challenged audience
   that may also have combined sensory or cognitive accessibility needs.
2. **The aids/obstacles split mirrors how the audience thinks.** A
   mobility-challenged user planning a trip is doing two distinct
   readings: "what helps me?" and "what's going to slow me down or hurt?"
   A flat row of category chips obscures that. The split is also a
   no-cost a11y win (two labeled groupings, each its own ARIA
   `role="group"` with `aria-labelledby`).
3. **The eye-icon "show on map" toggle solves a specific obstacle-safety
   concern.** If the chip itself toggled both legend and map visibility,
   a user could hide "barriers" and forget there are 3 along their
   route — bad for an obstacle category. Separating *count* (legend,
   always visible) from *render* (eye toggle) means a user can declutter
   the map without losing the obstacle awareness signal.
4. **High-zoom pixel stacking is real but secondary.** It only bites
   when a user is *already* inspecting a specific corner — a power-user
   moment where the existing list view partially compensates. Deferring
   it to Phase 2 is acceptable.
5. **Intersection clustering deserves its own decision.** Doing it well
   needs a backend migration, an algorithm choice (DBSCAN vs. snapping
   to OSM intersections via Overpass), and a contract change. Rushing
   it into Phase 1 risks shipping a brittle frontend-only spatial
   cluster that drifts on pan and zoom.

## Accessibility specifics

Phase 1 must satisfy the following beyond the baseline `DEC-009` /
WCAG 2.2 AA bar:

- **Strip has a non-map textual equivalent.** The chip group is the
  textual equivalent — a screen reader reading the page top-to-bottom
  encounters the strip before the map.
- **`role="group"` with `aria-labelledby`** for each of "Aids" and
  "Watch out for", so SR users hear the grouping explicitly.
- **Chip is `<button>` not `<div>`**, with `aria-pressed` for filter
  state. The eye toggle inside the chip is a separate `<button>` with
  its own `aria-label` (e.g., `Hide curb ramps from map; 12 along
  route`) and `aria-pressed` for visibility state.
- **Keyboard parity.** Tab moves between chips; Enter/Space toggles
  the filter; the eye toggle is reachable via Tab as a sibling
  control. No mouse-only paths.
- **Focus indicators ≥ 3:1 contrast** per `DEC-015`. The chip's
  pressed/unpressed states are distinguishable by **shape, fill, and
  label**, not color alone.
- **`aria-live="polite"` announcement** on filter change ("Showing
  4 categories along your route"), per `M2-F19`'s accessibility note,
  brought forward to Phase 1 since Phase 1 ships the filter behavior.
- **`prefers-reduced-motion` honored** on the first-visit explainer's
  dismissal animation and on any chip state transitions. No motion
  is essential to the interaction.
- **Counts read aloud as full phrases**, not bare numbers, e.g.
  `aria-label="12 curb ramps along this route"` rather than just `12`.
- **Cluster bubble screen-reader text** spells out the mix
  (`cluster of 5: 3 curb ramps, 2 barriers; press Enter to zoom`)
  per `M1-F08`'s existing acceptance criterion ("cluster count is
  announced on focus"), extended to include category mix.

Phase 2 carries its own accessibility constraints (intersection
popover focus management, member-feature ordering, etc.) to be
specified in the Phase 2 ticket.

## Consequences

- **Phase 1 is frontend-only.** No backend or schema changes; no new
  API surface. Implementation lands inside `apps/web/components/`
  (likely a new `RouteCategorySummary.tsx` plus changes to
  `BasemapInner.tsx` for cluster copy and `PlanExperience.tsx` for
  layout).
- **`<FeatureListView/>` becomes the detail surface, the strip becomes
  the summary surface.** PRD `M1-F09` (parallel list view) is
  unchanged but now sits below a richer header. The PRD entry for
  `M1-F08` should be updated in the same PR to reference the strip
  as part of the at-a-glance acceptance criterion.
- **`M2-F19` (toggle layers without re-routing) is partly delivered
  by Phase 1.** Phase 1 ships the per-category eye-toggle for the
  marker layer. The full `M2-F19` scope (which currently implies a
  separate filter UI) should be revisited and either folded into
  this work or scoped to additional non-strip filter affordances.
  The PRD will need an edit clarifying which parts of `M2-F19` are
  absorbed.
- **First-visit explainer adds one more `localStorage` key.** Reuse
  the same namespace as `DEC-010`'s onboarding flag.
- **Phase 2 commits the project to a backend migration.** When Phase 2
  starts, a new `DEC-NNN` will specify the intersection clustering
  algorithm, the migration, and the API contract change.
  `apps/backend/scout/data/store.py` and the corridor schema will
  change at that point.
- **No third-party TOS exposure.** This decision uses only existing
  data already ingested under the licenses cleared in `DEC-005`.
  No new outbound calls.
- **No `OQ-NN` is closed by Phase 1.** No `OQ-NN` is opened either.
  Phase 2's algorithmic choice may warrant a new `OQ-NN` when its
  ticket is filed.
- **Tickets implied by this DEC.**
  - **Phase 1, new ticket** — *Route-level category summary strip
    (aids vs. obstacles)*. Scope includes the strip UI, the chip
    component (filter + eye-toggle), the cluster-bubble copy update,
    and the first-visit explainer. Number assigned by PRD owner;
    suggested home: alongside `M1-F08` / `M1-F09`.
  - **Phase 2, new ticket(s)** — *Intersection-aware feature
    aggregation (backend + frontend)*. To be filed at the start of
    the next milestone, with its own `DEC-NNN`.
  - **PRD edits in the Phase 1 PR**: update `M1-F08` acceptance
    criteria to reference the summary strip; clarify
    `M2-F19`'s remaining scope after the eye-toggle absorbs the
    per-category filter behavior.

## Out of scope

- **Whether the existing `clusterRadius: 50` is optimal.** Untouched
  in Phase 1; revisit if user feedback after Phase 1 indicates
  low-zoom clusters are still confusing.
- **Cross-category co-location at a single corner** (curb ramp +
  audible signal + barrier within a few meters of each other). Phase 2's
  intersection popover addresses this; Phase 1 accepts the visual
  density.
- **Heatmap, density-overlay, or choropleth views.** Conflicts with
  `DEC-015` shape-family discipline; not pursued.
- **Driveway data quality.** The one true coordinate-duplicate row
  in `ADA_Driveway.geojson` is real but driveways is opt-in only;
  out of scope for this DEC.

---

*Draft. Promote to `docs/03-decisions.md` as `DEC-024` once Phase 1
ships.*
