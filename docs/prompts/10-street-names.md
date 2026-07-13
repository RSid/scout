# 10 — Street names in the feature list (+ deferred map labels)

**Scope:** `M2-F24` (this prompt) and a scoped-but-deferred `M2-F25`.
**Status:** M1 largely complete; this is M2 work.

You are a staff software engineer working in the Scout monorepo. Follow the root
`AGENTS.md` and the per-stack `AGENTS.md` files. Read the docs before coding
(`docs/01-one-pager.md`, `docs/02-prd.md`, `docs/03-decisions.md`,
`docs/appendix-data-schema.md`, `docs/prompts/README.md`). Do not re-litigate
decisions; do not invent APIs or dependencies; a change is not done until tests
pass.

---

## Goal

Attach a **street name** to each accessibility feature and surface it in the
feature list and popup (e.g. "on 14th St NW"). Deliver the map-label half as a
separate, deferred ticket.

## Grounding (verified against the codebase)

- The raw DC ADA GeoJSONs carry **no street name** — only opaque
  `INTERSECTION_ID` / `STREETSEGID` with no bundled lookup table. Street names
  must be **derived**.
- `features` rows are Points with a JSONB `attributes` bag. The corridor
  endpoint (`apps/backend/scout/data/store.py::corridor_features_geojson`)
  passes normalized props through to `CorridorFeatureProperties`
  (`apps/backend/scout/data/schema.py`), which the list and popup already read.
- Precedent for a bundled PostGIS reference table + KNN:
  `dc_addresses` (`DcAddress` model, `scripts/ingest_dc_addresses.py`,
  `store.py::reverse_dc_nearest_row` using `ST_Distance`).
- Precedent for testable SQL contracts extracted from query helpers:
  `corridor_features_select`, `search_dc_addresses_select` in `store.py`.
- `dc.pmtiles` already contains a `roads` source-layer with `name` / `pgf:name`
  (verified via the tileset metadata). No tile rebuild is needed for labels.
- The MapLibre style in `apps/web/components/BasemapInner.tsx`
  (`buildDcBasemapStyle`) uses `noLabels(sourceId, themeKey)` from
  `protomaps-themes-base` and has **no `glyphs:` URL** — so no `text-field` can
  render today (this likely also means the existing `cluster-count` labels do
  not render). The `public/fonts/*.woff2` are for HTML/CSS only; MapLibre needs
  self-hosted SDF glyph `.pbf` ranges.

## Locked decisions

- **Source (option B):** ingest DC's **Street Centerline** dataset and
  spatial-join each feature to its **nearest segment**. (Nearest-address parsing
  was rejected — features live on the roadway, not at an address point.)
- **Timing:** derive **once at ingest**, never per request (a per-feature KNN
  across the 500-cap corridor would blow the latency budget).
- **Storage:** a **first-class nullable `Feature.street_name` column** (not
  `attributes`), because intersection context is a likely follow-up and the
  value should be queryable/indexable.
- **Two tickets, two PRs:** `M2-F24` (list) ships first; `M2-F25` (map labels)
  is deferred behind glyph infrastructure.
- **New decision record:** `DEC-027` — nearest-centerline street attribution.

---

## M2-F24 — Street names in the feature list (this PR)

### 0. TOS review (do this first; do not skip — AGENTS.md #12)
- Locate and read the specific terms for the DC Street Centerline layer on the
  OCTO ArcGIS portal (`maps2.dcgis.dc.gov`, same provider already vetted for
  `dc_addresses`). Do **not** treat "same host" as automatic clearance.
- Record the finding in the PR under a **"Third-party TOS review"** heading and
  call it out in your summary reply. If terms are ambiguous or you can't find
  authoritative terms, **stop and surface it** — do not proceed past ambiguity.

### 1. Data source
- Add `data/Street_Centerlines.geojson` (OCTO ArcGIS). LineString geometry + a
  street-name field. **Confirm the exact field name** once pulled
  (`STREETNAME` / `ST_NAME` / full label) — it drives casing/parse normalization.

### 2. Reference table (parallels `dc_addresses`)
- New ORM model `DcStreetSegment` in `apps/backend/scout/data/models.py`:
  LineString `Geography`, `name`, `source_id`, GIST-indexed geom.
- New `scripts/ingest_dc_street_segments.py` mirroring
  `scripts/ingest_dc_addresses.py` (committed-snapshot path + `--fetch` path,
  `--dry-run`, sync engine via `SCOUT_DATABASE_URL`).
- New `make ingest-dc-street-segments` target.
- Persist (don't do it in-memory): matches the `dc_addresses` pattern, lets the
  KNN use the PostGIS spatial index, and is the substrate for the future
  intersection feature.

### 3. Derivation (at ingest, in SQL)
- After the feature upsert, run a KNN LATERAL join: for each `features` row,
  nearest `dc_street_segments` by `geom <-> geom`; write `features.street_name`.
- Extract a pure `nearest_street_name_select(...)` in `store.py` so the SQL
  contract is unit-testable without live PostGIS (same approach as
  `corridor_features_select`).
- Must be idempotent — re-running recomputes the same value and fits the
  existing upsert model.

### 4. Migration `0004`
- Add `features.street_name TEXT NULL`.
- Create `dc_street_segments` table + GIST index.

### 5. Backend surface
- Add `street_name: str | None` to `CorridorFeatureProperties` and to the
  `props` dict built in `corridor_features_geojson`. No new endpoint.
- Restrooms come from Refuge (not PG) and have no segment to join against —
  leave their `street_name` `None`. Skip them during the centerline enrichment
  step. Restroom rows already carry `attributes.address` (e.g.
  `"800 F Street NW, Washington, DC 20004"`); the frontend will use that as a
  location label fallback so restroom rows are not locationless.

### 6. Frontend
- `FeatureListView.FeatureRow` and `FeaturePopup` read `properties.street_name`.
- **Restroom fallback:** when `street_name` is null and `source_dataset` is
  `'refugerestrooms'`, display `attributes.address` as the location label
  instead. Extract this resolution logic into a shared utility (e.g.
  `apps/web/lib/map/location-label.ts`) so list, popup, and marker aria-label
  all share one code path. If both `street_name` and `attributes.address` are
  absent, omit the location segment and its separator gracefully.
- New i18n helper in `apps/web/lib/i18n/messages.ts`, e.g.
  `onStreetLabel(street)` → "on 14th St NW", rendered in **both** the visible
  summary and the `sr-only` line (non-map textual channel, `NF-A11Y`).
  For restroom address fallback, render the address directly (no "on" prefix).
- Structure the copy so an intersection framing
  ("14th St NW & P St NW") can replace the single-street string later without
  touching the data path.

### 7. Tests
- Unit: `nearest_street_name_select` SQL shape; any street-name normalizer;
  new ingest-script row mapping.
- Frontend: list/popup render the label and its `sr-only` equivalent; axe clean.
  Include a restroom row test that falls back to `attributes.address`, and a
  case where both `street_name` and `attributes.address` are absent (no
  leading separator rendered).
- No order-dependent tests; call out any mock per AGENTS.md #3.

### 8. Docs (same PR — AGENTS.md)
- `docs/appendix-data-schema.md`: new §B entry for the centerline source + the
  `street_name` derivation rule.
- `docs/03-decisions.md`: add `DEC-027`.
- `docs/02-prd.md`: add the `M2-F24` ticket.
- `scripts/AGENTS.md`: tool-registry row for the new ingest script.

---

## M2-F25 — Map street labels (deferred; scope only)

Blocked on infrastructure the app lacks. Do **not** start this in the F24 PR.

1. **Glyph stack first.** No `glyphs:` in the style, so MapLibre can't render
   `text-field`. Generate SDF glyph `.pbf` ranges for Atkinson Hyperlegible,
   self-host under `apps/web/public/glyphs/{fontstack}/{range}.pbf`
   (`NF-PRIV-01` — no CDN), add `glyphs:` to `buildDcBasemapStyle`, and add a
   `scripts/build_glyphs.sh` sibling to `fetch_fonts.sh`. First task: confirm
   whether the existing `cluster-count` labels render today (they likely do
   not) — this fixes them too.
2. Then add a **streets-only** `symbol` layer over the existing `roads`
   source-layer (no tile rebuild): `text-field` from
   `["coalesce", ["get","pgf:name"], ["get","name"]]`,
   `symbol-placement: "line"`, min-zoom gated, halo for ≥3:1 contrast, honoring
   `prefers-color-scheme` (already read), ordered **below** markers/route so
   obstacle glyphs are never occluded. Do not switch to the full `labels()` set.

---

## Risks / open items

- Mid-block vs. corner features: nearest-segment is right for sidewalk/barrier
  points, but a curb ramp at a corner may snap to either cross-street.
  Acceptable for single-street v1; the persisted centerline table is what makes
  the intersection upgrade clean later.
- Confirm the centerline street-name field name before finalizing the parse.
- Restrooms use `attributes.address` as a location label fallback. If the
  Refuge dataset ever drops that field, restroom rows will appear locationless.
