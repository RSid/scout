# scripts/

Operator-facing scripts. Read `AGENTS.md` for the per-folder conventions
before adding new ones (Python ingest scripts vs. thin shell wrappers).

The full tool registry lives in [`AGENTS.md`](./AGENTS.md). Highlights
relevant to the most common workflows:

## DC ingestion (`ingest_dc.py`)

Reads each `*.geojson` under `data/` and (optionally) the OSM bench /
drinking-water amenities in the DC bbox, normalizes them per
`docs/appendix-data-schema.md` §B, and upserts into the `features` PostGIS
table inside a single transaction so a mid-run failure rolls back cleanly
(M1-F11, M1-T03).

```bash
# Dry-run shortcut (no DB writes). Hits Overpass on first run, then caches.
make ingest

# Real write against the Compose DB (after `make docker-up`).
docker compose --project-directory . -f infra/docker-compose.yml \
    --profile ingest run --rm ingest-features --no-include-osm

# Full real run including OSM amenities.
docker compose --project-directory . -f infra/docker-compose.yml \
    --profile ingest run --rm ingest-features

# Direct CLI for unusual setups (host-side Postgres, custom DSN, etc.).
uv run --directory apps/backend python scripts/ingest_dc.py \
    --dry-run --no-include-osm \
    --database-url postgresql+asyncpg://scout:scout@localhost:5432/scout
```

The Overpass response cache lives under `data/derived/` (gitignored). Delete
those files to force a refresh, or extend the script with a `--refresh-osm`
flag when nightly refreshes become a need.

Idempotency: rows are keyed by `id = "{source_dataset}:{source_id}"` and the
upsert clause uses `ON CONFLICT (id) DO UPDATE … WHERE <columns IS DISTINCT
FROM excluded> RETURNING (xmax = 0)`. A second run with unchanged inputs
reports `inserted=0 updated=0 unchanged=N`; see `apps/backend/tests/test_ingest_db.py`.

## Other scripts

See the table in [`AGENTS.md`](./AGENTS.md) for `gh-issues.sh`,
`gh-pr.sh`, `new-issue.sh`, `fetch_fonts.sh`, and `build_pmtiles.sh`.
