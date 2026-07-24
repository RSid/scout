# Audit: feature ingest `kind` assignment by condition

## Background

Scout ingests DC OpenData features and assigns each row a `kind` of `"aid"` or
`"obstacle"`. Several categories delegate to the shared helper
`_map_good_fair_noncompliant` in `apps/backend/scout/ingest/dc.py`, which maps:

| Raw condition | `condition_normalized` | `kind` |
|---|---|---|
| Good | good | **aid** |
| Fair | mild | **aid** |
| Non-Compliant | blocking | obstacle |
| Missing | missing | obstacle |
| unknown/null | n_a | obstacle |

This mapping was designed for **curb ramps**, where it makes semantic sense: a
curb ramp in good condition genuinely *helps* someone navigate — it's an aid. A
missing or non-compliant ramp is an obstacle.

But this same mapping is reused by categories where "good condition" does **not**
mean "helps accessibility." A driveway crossing in good condition is still a
vehicle conflict point — it's an obstacle regardless of pavement quality. The
current logic marks it as an aid, which causes it to render green on the map and
in the feature list, misleading users about the nature of the hazard.

## What to audit

For each DC OpenData normalizer in `apps/backend/scout/ingest/dc.py`, answer:

1. **Does the category's nature change with condition?**
   A curb ramp in good shape is fundamentally different from a missing one (aid
   vs obstacle). A driveway in good shape is still the same thing (obstacle
   regardless). Which pattern does this category follow?

2. **Should `_map_good_fair_noncompliant` be used here, or should `kind` be
   fixed?**
   Categories that are always obstacles (like barriers) hardcode
   `kind="obstacle"` and only vary `condition_normalized`. Categories that are
   always aids (like audible signals) hardcode `kind="aid"`. Only categories
   whose fundamental nature flips based on condition should use the shared
   mapping.

3. **Does the category-level `kind` in `categories.py` match the per-row
   reality?**
   The `/api/categories` endpoint declares a single `kind` per category (e.g.
   driveways → obstacle), but individual rows may disagree. The frontend uses
   per-row `kind` for coloring, so a mismatch creates confusing UI.

## Categories to review

### Likely needs fixing

- **`driveways`** (`normalize_driveway`, line ~301): Uses
  `_map_good_fair_noncompliant` directly. A driveway is a vehicle crossing — it
  should probably always be `kind="obstacle"` regardless of condition, similar to
  barriers. Category-level kind is `"obstacle"` but Good/Fair rows are ingested
  as `"aid"`.

### Needs review

- **`bus_stops`** (`normalize_bus_stop`, line ~258): Also maps Good/Fair to aid.
  A bus stop in good condition is a transit access point (aid makes sense), but a
  non-compliant or missing bus stop is an obstacle. This might be correct, but
  verify the semantics match user expectations.

- **`median_cut_throughs`** (`normalize_median_cut_through`, line ~339):
  Overrides `_map_good_fair_noncompliant` to force Good/Fair → aid. A functional
  median cut-through does help someone cross — this is probably correct, but
  confirm.

### Likely correct (verify only)

- **`curb_ramps`** (`normalize_curb_ramp`, line ~117): The original use case for
  the shared mapping. Good ramp = aid, missing ramp = obstacle. Correct.

- **`barriers`** (`normalize_barrier`, line ~164): Always obstacle. Correct.

- **`audible_signals`** (`normalize_audible_signal`, line ~224): Always aid (a
  degraded signal is still a signal). Correct per the code comments.

- **`sidewalk_condition`** (`normalize_sidewalk_condition`, line ~421): Only
  ingests degraded segments, all as obstacles. Correct.

- **`rest_spots`**, **`water_cooling`** (OSM, `ingest/osm.py`): Always aid,
  condition is "present". Correct.

- **`restrooms`** (Refuge API, `clients/restrooms/normalize.py`): Always aid,
  only accessible restrooms included. Correct.

## Suggested fix pattern

For categories that should always be one kind, replace the
`_map_good_fair_noncompliant` delegation with a fixed `kind` and map condition
independently:

```python
def normalize_driveway(feat: GeoFeature) -> NormalizedRow | None:
    # ... existing field extraction ...
    cond_raw = _safe_str_props(props, "CONDITION")
    cn, _unused_kind = _map_good_fair_noncompliant(cond_raw)
    return NormalizedRow(
        # ...
        kind="obstacle",              # always an obstacle
        condition_normalized=cn,       # condition still varies
    )
```

After fixing, re-run `make ingest` and verify with:

```sql
SELECT kind, condition_normalized, count(*)
FROM features
WHERE category = 'driveways'
GROUP BY kind, condition_normalized;
```

## Related frontend context

- `deriveMarkerSeverity()` in `apps/web/lib/map/markers.ts` short-circuits to
  green when `kind === "aid"`, so wrong `kind` values directly cause wrong icon
  colors.
- The block-grouping summary bar in `FeatureListView.tsx` tallies aids vs
  obstacles per block — miscategorized driveways inflate the aid count.
