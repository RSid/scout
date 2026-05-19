# scripts/AGENTS.md

Data-ingestion and dev-utility scripts. Read `../AGENTS.md` first.

## Stack

- Pure Python ≥ 3.12 with `uv`. No ETL frameworks (no Dagster, Airflow,
  Prefect).
- `SQLAlchemy` + `GeoAlchemy2` for DB writes. The schema is owned by
  `apps/backend/`'s Alembic migrations; scripts import the ORM models but
  never `CREATE TABLE`.
- `httpx` for outbound HTTP, with retry and timeout configured explicitly.
- `argparse` for CLIs (std-lib; `typer` is allowed if it earns the new dep
  per the root AGENTS.md "Dependency policy").
- `logging` from the standard library, structured key-value lines. No
  `print`.

## CLI shape

Every script supports at least:

- `--dry-run` — parse, validate, count; do not write.
- `--database-url URL` — overrides `SCOUT_DATABASE_URL`.
- `--log-level LEVEL` — defaults to `INFO`.

Scripts are idempotent and re-runnable.

## Idempotency and transactionality

- Writes use `INSERT … ON CONFLICT (id) DO UPDATE` (SQLAlchemy 2.x's
  `postgresql.insert(...).on_conflict_do_update(...)`).
- The entire ingest runs in **one transaction**. On any error, rollback —
  the DB is never left in a partial state.
- Re-running with unchanged inputs results in `inserted=0, updated=0,
  unchanged=N`. Verify in tests.

## Tests

- Per-dataset mapping functions are **pure Python** — test them without a
  DB.
- DB-touching tests use an ephemeral PostGIS via `testcontainers-postgres`
  *or* a CI service container.
- Network calls (Overpass, Refuge Restrooms, etc.) are mocked — never the
  real wire in tests.
- Mocks obey the visibility rule in the root `AGENTS.md` (rule #3):
  `# MOCK: <what and why>` at the mock site, and listed in the PR
  description.

## Logging

- One `INFO` line at start, one at end. Include counts: `datasets=N`,
  `inserted=N`, `updated=N`, `unchanged=N`, `took_ms=N`.
- Errors include the dataset and the row id under inspection.
- Never log API keys or raw response bodies.

## Don'ts

- Don't define schema in scripts. Schema is Alembic-owned.
- Don't drop raw `condition` fields. Downstream UI shows "source said: ___".
- Don't change the data schema without updating
  `docs/appendix-data-schema.md`, the PRD §9.2 DDL, and adding a new
  Alembic migration — all in the same PR.
