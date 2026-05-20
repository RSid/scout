# scripts/AGENTS.md

Data-ingestion and dev-utility scripts. Read `../AGENTS.md` first.

This folder holds two distinct categories, with different rules:

1. **Ingestion scripts** (Python) — read source data, transform, write to
   the DB. Subject to the *Stack*, *CLI shape*, *Idempotency*, and *Tests*
   sections below.
2. **External-CLI wrappers** (shell) — thin, read-only or single-purpose
   wrappers around tools like `gh`, `fly`, `docker`. Subject only to the
   *External-CLI wrappers* section below.

When in doubt, write Python. Reach for shell only when the entire job is
"shape some args, call one external CLI, pass its output through."

## Stack (ingestion scripts)

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

## CLI shape (ingestion scripts)

Every ingestion script supports at least:

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

## External-CLI wrappers

For scripts whose entire job is "shape some args, call one external CLI,
emit its output":

- POSIX `bash` with `set -euo pipefail`. Executable (`chmod +x`).
- Top-of-file docstring block with one-line description, full *Usage*
  examples, and a one-line note on inputs/outputs. `--help` prints it.
- Read-only by default. If the script mutates remote state (creates
  issues, deploys, etc.), say so loudly in the docstring and gate
  destructive paths behind an explicit flag or env var.
- Fail fast if the external CLI is missing or unauthenticated, with a
  message that names the fix (`Run: gh auth login`).
- No hidden globals; configurable via flags first, env vars second
  (document both). Default `REPO` and similar to the values appropriate
  for this repo.
- No tests required for sub-50-line wrappers whose only logic is arg
  parsing plus one external call. If a wrapper grows non-trivial logic,
  promote it to Python and apply the ingestion-script rules.

## Tool registry

Agent-facing scripts in this folder. **Prefer running these over
re-implementing the underlying CLI call** — they exist precisely so the
"right invocation" lives in one place that agents and humans share.

When you add a registered script, append a row here. Each script's own
top-of-file docstring remains the source of truth for flags.

| Script                   | What it does                                                                                                            | When to reach for it                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `scripts/gh-issues.sh`   | Lists issues in `RSid/scout` (JSON or table), optional milestone filter.                                                | Anytime an agent or contributor needs issue metadata as data.                     |
| `scripts/fetch_fonts.sh` | Downloads the four Atkinson Hyperlegible `.woff2` files (+ OFL license) from googlefonts/atkinson-hyperlegible into `apps/web/public/fonts/`. Idempotent. | Before the first `pnpm dev` on a fresh clone, or after a font-family swap (see DEC-015). |
