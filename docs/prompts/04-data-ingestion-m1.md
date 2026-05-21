# Prompt: Build the M1 DC data ingestion pipeline

## Role

You are a senior data engineer. You write a small, idempotent, well-tested Python
script that turns DC OpenData GeoJSONs (plus selected OSM amenities) into rows
in the `features` PostGIS table that the backend queries.

## Inputs (read these before coding)

- `docs/appendix-data-schema.md` — **the source of truth for every mapping rule.**
- `docs/02-prd.md` §6.1 ticket M1-F11, §9.2 (DDL), §9.3 (corridor query).
- `docs/03-decisions.md` DEC-019 (PostgreSQL + PostGIS from M1), DEC-018.
- The seven `*.geojson` files in the repo root (move them to `data/` as part of
  this work).
- The first Alembic migration (created by the backend scaffold) — it owns the
  schema; this script only writes data.

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

The output is rows in the `features` table of the PostgreSQL DB pointed at by
`SCOUT_DATABASE_URL`. No standalone artifact file (Alembic + the live DB are
the source of truth).

## Required behaviors

### CLI

```
uv run python scripts/ingest_dc.py \
    [--dry-run] \
    [--include-osm/--no-include-osm] \
    [--database-url URL]   # overrides SCOUT_DATABASE_URL
```

- `--dry-run` parses + maps + counts but does not write to the DB. Useful in CI.
- `--include-osm` (default: true) fetches OSM amenities via Overpass.
- `--database-url` overrides the env var (used by tests / local debugging).

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

- Use PostgreSQL `INSERT ... ON CONFLICT (id) DO UPDATE SET ...` (via
  SQLAlchemy 2.x's `postgresql.insert(...).on_conflict_do_update(...)`).
- Re-running with unchanged inputs must result in zero changed rows.
  (Use `xmax = 0` trick or compare counts before/after to verify.)
- Process the entire ingest inside one transaction. On any error, rollback —
  the DB should never be left in a partial state.

### Logging

Use `logging` (not `print`) at INFO level. On completion, log:

```
ingest complete | datasets=N | features_total=N |
features_per_category={...} | inserted=N | updated=N | unchanged=N | took_ms=N
```

### Tests

`tests/test_ingest.py` covers:

- Each per-dataset mapping function maps a representative input row to the
  expected normalized output (pure-Python, no DB needed).
- Casing normalization of `ASSET_TYPE` works for known dirty inputs.
- The skip rule for Accessible Parking Zones is honored.
- Idempotency: running ingest twice against an ephemeral test PG database (a
  pytest fixture using `testcontainers-postgres` *or* a CI service container)
  yields `inserted=N, updated=0, unchanged=N` on the second run.
- Transactional rollback: a forced failure mid-ingest leaves zero rows.
- OSM Overpass is mocked (no real network).

**Per `<user_rule>`:** when mocking OSM Overpass (or anything else), add a
`# MOCK:` comment and list each mock in the PR description for owner review.

## Don't

- Don't bring in heavy ETL frameworks (Dagster, Airflow, etc.). Plain Python.
- Don't define the schema in this script. The schema lives in the Alembic
  migration owned by `apps/backend/`. This script imports the SQLAlchemy
  model and writes rows.
- Don't drop the raw `condition` field; downstream needs it for the "source
  said: ___" UI.
- Don't change the schema without updating `docs/appendix-data-schema.md`,
  PRD §9.2, and adding a new Alembic migration — all in the same PR.

## Deliverable

A working `scripts/ingest_dc.py` plus its OSM helper, with tests, that
populates the `features` table. Update the root `README.md` with the command
to run it (`uv run python scripts/ingest_dc.py`). Commit message:
`feat(data): build M1 DC ingestion pipeline per docs/appendix-data-schema.md`.
