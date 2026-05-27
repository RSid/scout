# Appendix — Data schema reference

Source-of-truth mapping from raw DC OpenData GeoJSON files (and the Refuge Restrooms
API) to Scout's normalized `Feature` schema. Used by `scripts/ingest_dc.py` (M1-F11)
and by the Refuge Restrooms integration (M1-F13).

---

## A. Normalized `Feature` schema

```jsonc
{
  "id": "string — stable across re-ingests",
  "category": "curb_ramps | barriers | audible_signals | bus_stops | restrooms | rest_spots | water_cooling | driveways | median_cut_throughs",
  "kind": "obstacle | aid",
  "condition": "string — raw source value, preserved verbatim",
  "condition_normalized": "blocking | difficult | mild | good | missing | present | absent | n_a",
  "inspected_year": "integer | null",
  "source_dataset": "string — short ID for the dataset",
  "source_id": "string — original GIS_ID or equivalent",
  "geometry": { "type": "Point|LineString", "coordinates": [...] },
  "attributes": { /* category-specific extras, e.g. estimated_year_of_improvement */ }
}
```

### Category metadata (drives `/api/categories`)

| Category ID | Label | Default kind | Default-enabled in M1 |
|---|---|---|---|
| `curb_ramps` | Curb ramps | obstacle (when non-compliant/missing) | yes |
| `barriers` | Sidewalk barriers | obstacle | yes |
| `audible_signals` | Audible pedestrian signals | aid (gap when absent) | yes |
| `bus_stops` | Accessible bus stops | aid | M2 (off in M1) |
| `restrooms` | Accessible restrooms | aid | yes |
| `rest_spots` | Rest / seating (OSM) | aid | yes (per OQ-04 default) |
| `water_cooling` | Water fountains (OSM) | aid | yes (per OQ-05 default) |
| `driveways` | Driveway crossings | obstacle (when non-compliant) | no (data is low signal) |
| `median_cut_throughs` | Median cut-throughs | aid | no (low coverage) |

> Categories with `default-enabled = no` are still queryable; they're just off in the
> default Profile so the M1 user isn't overwhelmed.

---

## B. Per-dataset mapping rules

### B.1 `ADA_Curb_Ramp.geojson` → `curb_ramps`

- **Feature count:** 34,859 points
- **Source ID field:** `GIS_ID` (e.g., `ADA_CurbRampPt_1`)
- **`source_dataset`:** `dc_ada_curb_ramp`

Condition mapping (`CONDITION` → `condition_normalized` and `kind`):

| CONDITION value | `condition_normalized` | `kind` |
|---|---|---|
| `"Good"` | `good` | `aid` |
| `"Fair"` | `mild` | `aid` |
| `"Non-Compliant"` | `blocking` | `obstacle` |
| `"Missing"` | `missing` | `obstacle` |
| `null` | `n_a` | `obstacle` (conservative) |

**Attributes preserved:** `ESTIMATED_YEAR_OF_IMPROVEMENT`, `STATUS`.

**Counts** (from M1 ingestion sample): 16,139 non-compliant + 3,885 missing = 57%
problematic; 11,020 good; 3,638 fair; 177 null.

---

### B.2 `ADA_Barriers_in_the_Public_Right_of_Way.geojson` → `barriers`

- **Feature count:** 12,952 points
- **Source ID field:** `GIS_ID`
- **`source_dataset`:** `dc_ada_barriers`

`ASSET_TYPE` → `condition_normalized` mapping. The source has casing inconsistency
(`"vertical displacement"` and `"Vertical Displacement"` coexist). **Normalize to
lowercase before mapping.**

| Normalized ASSET_TYPE | `condition_normalized` | Notes |
|---|---|---|
| `vertical displacement` | `difficult` | trip hazard |
| `horizontal displacement` | `difficult` | gap hazard |
| `no sidewalk` | `blocking` | path absent |
| `sidewalk ends` | `blocking` | dead-end |
| `sidewalk cracked` | `mild` | passable with care |
| `pole` | `mild` | navigable around |
| (other) | `mild` | default |

**`kind`:** always `obstacle`.
**Attributes preserved:** `ASSET_TYPE` (raw + normalized), `STATUS`,
`ESTIMATED_YEAR_OF_IMPROVEMENT`.

---

### B.3 `ADA_Audible_Pedestrian_Signals.geojson` → `audible_signals`

- **Feature count:** 7,823 points
- **Source ID field:** `GIS_ID`
- **`source_dataset`:** `dc_ada_audible_signals`

`PUSHBUTTON_TYPE` → `condition_normalized`. **`kind` is always `aid`** —
audible pedestrian signals are a support category, and a non-compliant or
absent button is a degraded / missing aid, not a separate obstacle on the
ground. Per-row *quality* lives in `condition_normalized` so consumers can
penalize non-compliant or absent buttons without flipping the feature class:

| PUSHBUTTON_TYPE | `condition_normalized` | `kind` |
|---|---|---|
| `"Type C: Compliant version with Vibro-tactile and arrow"` | `present` | `aid` |
| `"Type B: 3-inch button (non-compliant)"` | `difficult` | `aid` |
| `"Type A : Old version (non-compliant)"` | `difficult` | `aid` |
| `"None"` | `absent` | `aid` |
| `null` | `n_a` | `aid` |

**Attributes preserved:** `PUSHBUTTON_TYPE`, `INTERSECTION_ID`,
`ESTIMATED_YEAR_OF_IMPROVEMENT`.

**Note for P3 (low-vision) routing in M2:** absence of an audible signal at
an intersection is still actionable information — routing weights should
treat `condition_normalized in {"absent", "difficult"}` as a penalty for
P3-aware profiles, even though `kind` stays `aid`.

---

### B.4 `ADA_Bus_Stop.geojson` → `bus_stops`

- **Feature count:** 3,317 points
- **Source ID field:** `GIS_ID`
- **`source_dataset`:** `dc_ada_bus_stop`
- **Default-enabled in M1:** **No.** Activated in M2 (M2-F17).

Condition mapping like B.1 (Good/Fair/Non-Compliant). `kind` = `aid` when
`Good`/`Fair`, `obstacle` when `Non-Compliant`.

---

### B.5 `ADA_Driveway.geojson` → `driveways`

- **Feature count:** 28,069 points
- **Source ID field:** `GIS_ID`
- **`source_dataset`:** `dc_ada_driveway`
- **Default-enabled in M1:** **No.** This dataset is noisy (most users walk past
  driveways without incident; the data was collected with a different use case in
  mind). Available as an opt-in category for users who care about every detail.

Condition mapping same as B.1.

---

### B.6 `ADA_Median_Cut_Through.geojson` → `median_cut_throughs`

- **Feature count:** 845 points
- **Source ID field:** `GIS_ID`
- **`source_dataset`:** `dc_ada_median_cut_through`
- **Default-enabled in M1:** **No** (low coverage and only relevant when crossing
  wide medians).

Condition mapping same as B.1. `kind` = `aid` when present/good.

---

### B.7 `Accessible_Parking_Zones.geojson` → **NOT INGESTED IN M1**

- **Feature count:** 203 line-segments
- **Issue:** 166 of 203 records have `PARKINGGROUP = "ERROR"`. Only 37 are usable.
- **Decision:** flag in `appendix-data-schema.md` (here) and skip in M1 ingestion.
  Revisit when a cleaner data source is identified.

---

### B.8 Refuge Restrooms API → `restrooms`

- **Endpoint:** `GET https://www.refugerestrooms.org/api/v1/restrooms/by_location`
  with `ada=true` and a DC bbox filter applied client-side (the API supports
  `lat`/`lng`/`distance` but not bbox; iterate over a small grid of points or
  filter post-fetch).
- **Cache:** 24 h server-side via an in-process TTL cache inside the
  `RefugeRestrooms` adapter (per DEC-020). On restart the cache is empty and
  is rehydrated from the upstream API on first request. This data isn't
  stored in the `features` PG table because it changes more frequently than
  DC OpenData and we want to always reflect Refuge's latest. If rate-limit
  pressure ever appears, the adapter can be backed by a `restroom_cache`
  table in PG without changing call sites.
- **Mapping:**

| API field | Normalized field |
|---|---|
| `id` | `source_id` (prefixed: `refugerestrooms:{id}`) |
| `accessible` (must be true) | `condition_normalized = "present"`; `kind = "aid"` |
| `name`, `street`, `city`, `state` | `attributes.label`, `attributes.address` |
| `directions`, `comment` | `attributes.notes` (plain text, sanitized) |
| `unisex`, `changing_table` | `attributes.unisex`, `attributes.changing_table` |
| `updated_at` (year) | `inspected_year` |
| `latitude`, `longitude` | `geometry.coordinates = [lng, lat]` |

- **`source_dataset`:** `refugerestrooms`.
- **`category`:** `restrooms`.

---

### B.9 OSM amenities (M1 — per OQ-04, OQ-05)

For `rest_spots` and `water_cooling`, fetch from OSM via Overpass API at ingest
time and bake into the source data:

- `rest_spots`: `node[amenity=bench]` in DC bbox → `kind = "aid"`,
  `condition_normalized = "present"`.
- `water_cooling`: `node[amenity=drinking_water]` in DC bbox → `kind = "aid"`,
  `condition_normalized = "present"`.

**`source_dataset`:** `osm_overpass_{amenity}`.
**`source_id`:** `osm:node/{osm_id}`.
**`inspected_year`:** derived from the OSM tag `check_date` if present, else
`null`.

---

## C. Ingestion algorithm (pseudocode for `scripts/ingest_dc.py`)

```python
async def ingest(session: AsyncSession) -> IngestResult:
    rows = []
    for dataset in DATASETS:                 # one entry per source above
        if not dataset.enabled_in_m1:
            log.info("skipping", id=dataset.id, reason="per data-schema.md")
            continue
        raw = load_geojson(dataset.path)
        for raw_feat in raw["features"]:
            rows.append(normalize(raw_feat, dataset.mapping_rules))

    rows.extend(await fetch_osm_amenities("bench", category="rest_spots"))
    rows.extend(await fetch_osm_amenities("drinking_water", category="water_cooling"))

    # Upsert per DEC-019. ON CONFLICT (id) keeps re-runs idempotent.
    stmt = (
        insert(Feature)
        .values(rows)
        .on_conflict_do_update(
            index_elements=[Feature.id],
            set_={col: getattr(insert_excluded, col) for col in UPDATABLE_COLS},
        )
    )
    result = await session.execute(stmt)
    await session.commit()
    return summarize(result)
```

**Idempotency:** rows are keyed by `id = f"{source_dataset}:{source_id}"`.
Re-running with unchanged inputs results in zero changed rows (verifiable
via `xmax = 0` or by comparing counts).

---

## D. Data freshness banner thresholds

| Age | UI treatment |
|---|---|
| ≤ 1 year | No warning |
| 1–3 years | Subtle "as of YYYY" label |
| > 3 years | Inline warning chip: "Data may be outdated (last inspected YYYY)" |
| Missing | "Inspection date unknown" |

These thresholds power the Feature popup (M1-F08) and the list view (M1-F09).

---

*End of data schema appendix.*
