# Refresh the DC Master Address Repository snapshot (`dc_addresses`)

## When to run

- **Quarterly-ish** maintenance for M1, or sooner if DC addressing policy shifts materially.
- After resetting Postgres (`docker compose ... down -v`) whenever you rely on autocomplete while developing.

Prerequisite: Alembic revision `0002` has created `dc_addresses` (`make migrate` or backend lifespan migration).

## Local / Compose Postgres

From the repo root, with the Compose stack reachable (`make docker-up` brings
`db` up; the target also brings it up on demand):

```bash
make ingest-dc-addresses
```

The Makefile target runs the script through Compose's profile-gated `ingest`
service, so it executes inside the bridge network with `db:5432` as the DSN —
your host-side `.env` / `SCOUT_DB_HOST_PORT` overrides are irrelevant.

This loads the committed snapshot at [`data/dc_addresses.jsonl`](../../data/dc_addresses.jsonl) with idempotent upserts.

Script reference: [`scripts/ingest_dc_addresses.py`](../../scripts/ingest_dc_addresses.py).

## Updating the bundled JSONL (needs network)

Regenerate ~140k rows from OCTO ArcGIS (`DCGIS_DATA/Location_WebMercator`, layer **0**) into a sorted JSONL file. The script's `--fetch` mode runs in dry-run by default when paired with `--write-jsonl`, so pass the args through the Compose service:

```bash
make ingest-dc-addresses ARGS='--fetch --write-jsonl /app/data/dc_addresses.jsonl --dry-run'
```

(The `data/` directory is bind-mounted read-only inside the `ingest`
container, so prefer running the network refresh from the host venv if you
need to write back into the repo:)

```bash
uv run --directory apps/backend python scripts/ingest_dc_addresses.py \
  --fetch --write-jsonl data/dc_addresses.jsonl --dry-run
```

Review `git diff data/dc_addresses.jsonl`, run `make ingest-dc-addresses` against a disposable database, smoke-test autocomplete, commit with PR rationale.

Source license: MAR open data via Open Data DC (CC0).

## Verify

```sql
SELECT COUNT(*) FROM dc_addresses;
SELECT label_full FROM dc_addresses WHERE label_full ILIKE '4818%KANSAS%' LIMIT 1;
```

UI smoke (`make docker-up-realistic-run`): type **`4818 ka`** → **`4818 KANSAS AVENUE NW`**.

## Named places (`dc_points_of_interest`, DEC-026)

The same OCTO FeatureServer publishes a sibling alias layer ("Points of
Interest - MAR Aliases", layer **3**) — named landmarks (schools, federal
buildings, museums, monuments, libraries) keyed to a `MAR_ID` in
`dc_addresses`. **Refresh `dc_addresses` first** — this ingest joins against
it to resolve each place's coordinates and street address, so a stale
`dc_addresses` table produces stale/orphaned POI rows.

Prerequisite: Alembic revision `0003` has created `dc_points_of_interest`.

```bash
make ingest-dc-pois
```

Runs through the profile-gated `ingest-poi` Compose service (same bridge
network as `ingest`). Loads the committed snapshot at
[`data/dc_points_of_interest.jsonl`](../../data/dc_points_of_interest.jsonl)
with idempotent upserts.

Script reference: [`scripts/ingest_dc_points_of_interest.py`](../../scripts/ingest_dc_points_of_interest.py).

Regenerate the JSONL from OCTO ArcGIS (layer **3**):

```bash
make ingest-dc-pois ARGS='--fetch --write-jsonl /app/data/dc_points_of_interest.jsonl --dry-run'
```

Or from the host venv to write back into the repo:

```bash
uv run --directory apps/backend python scripts/ingest_dc_points_of_interest.py \
  --fetch --write-jsonl data/dc_points_of_interest.jsonl --dry-run
```

Review `git diff data/dc_points_of_interest.jsonl`, run `make ingest-dc-pois`
against a disposable database (with `dc_addresses` already loaded),
smoke-test the search box, commit with PR rationale.

Source license: MAR open data via Open Data DC (CC0) — same source family
already accepted for `dc_addresses` under DEC-023.

### Verify

```sql
SELECT COUNT(*) FROM dc_points_of_interest;
SELECT label_full FROM dc_points_of_interest WHERE label_normalized ILIKE '%national building%';
```

UI smoke (`make docker-up-realistic-run`): type **`national build`** →
**`NATIONAL BUILDING MUSEUM, ...`**.
