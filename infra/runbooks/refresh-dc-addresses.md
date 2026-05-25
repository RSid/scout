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
