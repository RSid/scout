# Prompt: Build the M1 DC data ingestion pipeline

## Role

You are a senior data engineer. You write a small, idempotent, well-tested Python
script that turns DC OpenData GeoJSONs (plus selected OSM amenities) into a
single pre-built artifact the backend loads at startup.

## Inputs (read these before coding)

- `docs/appendix-data-schema.md` — **the source of truth for every mapping rule.**
- `docs/02-prd.md` §6.1 ticket M1-F11.
- `docs/03-decisions.md` DEC-004 (in-memory store) and DEC-018.
- The seven `*.geojson` files in the repo root (move them to `data/` as part of
  this work).

## What to build

```
scripts/
├── ingest_dc.py               # the main script
├── _osm_overpass.py           # small Overpass helper
└── README.md                  # explains how to run it

data/
├── ADA_Curb_Ramp.geojson
├── ADA_Barriers_in_the_Public_Right_of_Way.geojson
├── ADA_Audible_Pedestrian_Signals.geojson
├── ADA_Bus_Stop.geojson
├── ADA_Driveway.geojson
├── ADA_Median_Cut_Through.geojson
└── Accessible_Parking_Zones.geojson   # NOT INGESTED — keep for posterity
```

The output is a single file:

```
data/derived/features.parquet           # or .feather; pick one and stick with it
```

## Required behaviors

### CLI

```
uv run python scripts/ingest_dc.py [--dry-run] [--output PATH] [--include-osm]
```

- `--dry-run` prints counts per category/condition and exits without writing.
- `--include-osm` (default: true) fetches OSM amenities via Overpass.
- `--output` overrides the default output path.

### Per-dataset processing

Implement exactly the mapping rules in `docs/appendix-data-schema.md` §B. For
each row:

1. Skip rows whose dataset is marked "not ingested in M1" (see Accessible
   Parking Zones).
2. Build the normalized `Feature` per §A.
3. Compute `id = f"{source_dataset}:{source_id}"`.
4. Normalize `ASSET_TYPE` for the barriers dataset to lowercase before mapping.
5. Preserve raw `condition` and add `condition_normalized`.

### OSM amenities (when `--include-osm`)

- Use Overpass API with a DC bbox.
- Two passes: `node[amenity=bench]` and `node[amenity=drinking_water]`.
- Be a good Overpass citizen: timeout 60 s, retry once with 2× back-off,
  user-agent string `scout/0.1 (https://github.com/[your]/scout)`.
- Cache the raw Overpass JSON to `data/derived/osm_{amenity}.json` so re-runs
  don't hammer the API.

### Idempotency

Re-running with unchanged inputs must produce a byte-identical output. Sort the
output by `id` before writing.

### Logging

Use `logging` (not `print`) at INFO level. On completion, log:

```
ingest complete | datasets=N | features_total=N | features_per_category={...} |
output_path=... | bytes=N | took_ms=N
```

### Tests

`tests/test_ingest.py` covers:

- Each per-dataset mapping function maps a representative input row to the
  expected normalized output.
- Casing normalization of `ASSET_TYPE` works for known dirty inputs.
- The skip rule for Accessible Parking Zones is honored.
- Idempotency: running ingest twice on the same input yields byte-identical
  output.
- OSM Overpass is mocked (no real network).

## Don't

- Don't bring in heavy ETL frameworks (Dagster, Airflow, etc.). Plain Python.
- Don't write to a database in M1.
- Don't drop the raw `condition` field; downstream needs it for the "source
  said: ___" UI.
- Don't change the schema without updating `docs/appendix-data-schema.md` in the
  same PR.

## Deliverable

A working `scripts/ingest_dc.py` plus its OSM helper, with tests, that produces
`data/derived/features.parquet`. Update the root `README.md` with the command
to run it. Commit message: `feat(data): build M1 DC ingestion pipeline per
docs/appendix-data-schema.md`.
