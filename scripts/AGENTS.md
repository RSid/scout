# scripts/AGENTS.md

Data-ingestion and dev-utility scripts. Read `../AGENTS.md` first.

This folder holds two distinct categories, with different rules:

1. **Ingestion scripts** (Python) — read source data, transform, write to
   the DB. Subject to the _Stack_, _CLI shape_, _Idempotency_, and _Tests_
   sections below.
2. **External-CLI wrappers** (shell) — thin, read-only or single-purpose
   wrappers around tools like `gh`, `docker`, or the chosen host's deploy CLI.
   Subject only to the _External-CLI wrappers_ section below.

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
  _or_ a CI service container.
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
- Don't drop raw `condition` fields. Downstream UI shows "source said: \_\_\_".
- Don't change the data schema without updating
  `docs/appendix-data-schema.md`, the PRD §9.2 DDL, and adding a new
  Alembic migration — all in the same PR.

## External-CLI wrappers

For scripts whose entire job is "shape some args, call one external CLI,
emit its output":

- POSIX `bash` with `set -euo pipefail`. Executable (`chmod +x`).
- Top-of-file docstring block with one-line description, full _Usage_
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

| Script                              | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | When to reach for it                                                                                                                                                                                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Makefile (repo root)                | Shortcut targets (`make help`): sync, lint, Compose, DC MAR ingest (`make ingest-dc-addresses`), DC features dry-run (`make ingest`), DC features write (`make ingest-write`). Prefer over ad-hoc tool invocations. **`docker-up-realistic-run` is the canonical "exercise everything we ship to prod" entry point — whenever you add a new vendor adapter (new dir under `apps/backend/scout/clients/<concern>/` or `apps/web/lib/providers/<concern>/`), flip the relevant env var in `infra/docker-compose.realistic.yml` so this target keeps exercising every real call path.**                                                   | Everyday dev + agent workflows; aligns with DEC-011. Pair `docker-up` / `docker-up-stubbed-run` (all stubs, no outbound calls) with `docker-up-realistic-run` (real ORS + Refuge + geocoding, interactive map) depending on what you need to verify. |
| `scripts/ingest_dc_addresses.py`    | Paginates OCTO MAR ArcGIS FeatureServer or reads `data/dc_addresses.jsonl`, upserts into `dc_addresses` (idempotent, one transaction). Supports `--fetch`, `--write-jsonl`, `--dry-run`, `--database-url`, `--log-level`.                                                                                                                                                                                                                                                                                                                                                                                                             | After `make migrate`; refresh the MAR snapshot (`--fetch --write-jsonl data/dc_addresses.jsonl`) before releases. Prefer `make ingest-dc-addresses` for local loads.                                                                                |
| `scripts/gh-issues.sh`              | Lists issues in `RSid/scout` (JSON or table), optional milestone filter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Anytime an agent or contributor needs issue metadata as data.                                                                                                                                                                                       |
| `scripts/new-issue.sh`              | **Mutates GH when `--yes`:** proposes the next milestone `M{n}-Tnn` title (counts existing GH milestone issues + hits in `docs/02-prd.md`) or uses `--type F --id`; default is dry-run.                                                                                                                                                                                                                                                                                                                                                                                                                                               | Creating collision-free scaffolding issues with the right numbering prefix; never run `--yes` from an agent unless the human asked to create the issue on GitHub.                                                                                   |
| `scripts/gh-pr.sh`                  | Builds a GitHub-ready PR description from commits + branch + diff (fills the `prefill:*` sentinel blocks); default dry-run (`--yes` publishes a draft PR).                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Faster PR authoring from the CLI; pair with reviewing the generated Markdown before `--yes`.                                                                                                                                                        |
| `.pre-commit/prepare-commit-msg.sh` | Appends `(M{n}-…)` / `DEC-…` / `OQ-…` extracted from **branch names** to the interactive commit subject. Skips `-m`/merge/squash.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Keeps commits aligned with IDs when using `pre-commit install` (+ `prepare-commit-msg`); see AGENTS.md.                                                                                                                                             |
| `scripts/fetch_fonts.sh`            | Downloads the four Atkinson Hyperlegible `.woff2` files (+ OFL license) from googlefonts/atkinson-hyperlegible into `apps/web/public/fonts/`. Idempotent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Before the first `pnpm dev` on a fresh clone, or after a font-family swap (DEC-015).                                                                                                                                                                |
| `scripts/build_pmtiles.sh`          | Extracts a DC-bbox subset (`--maxzoom=15` by default) from `https://build.protomaps.com/<date>.pmtiles` via the `pmtiles` CLI into `apps/web/public/tiles/dc.pmtiles` (custom path positional for Docker builds). Probes `SCOUT_PROTOMAPS_BUILD_DATE` first, then walks back up to `SCOUT_PROTOMAPS_WALKBACK_DAYS` (default 14) when the preferred daily build 404s — same resolver for CI, Docker, and local runs. Requires network; skips if artifact exists unless `--force`.                                                                                                                                                                                                                                                                                                                                                        | After cloning, before enabling `NEXT_PUBLIC_SCOUT_MAP_MODE=interactive` locally, or updating the basemap extract (M1-T05 carve-out).                                                                                                                |
| `scripts/ingest_dc.py`              | Parses DC ADA GeoJSON snapshots + optional OSM Overpass benches/fountains into `features` (single transaction UPSERT via SQLAlchemy). Supports `--dry-run`, `--include-osm/--no-include-osm`, `--database-url`, `--log-level`, `--data-dir`.                                                                                                                                                                                                                                                                                                                                                                                          | After `make migrate` against PostGIS (`M1-F11`/`M1-T03`); `make ingest` for a dry tally, `make ingest-write` to UPSERT. Prefer `SCOUT_DATABASE_URL` from `.env`, not literals in shell history.                                                     |
| `scripts/dev-mobile-lan.sh` | Compose up with `-f infra/docker-compose.yml -f infra/docker-compose.mobile.yml`, prints guessed LAN URL + ASCII QR (`qrencode` optional). | Testing the planner/UI from a physical phone over Wi-Fi HTTP (quick layout sanity). Issue #46 / `infra/README.md` §Testing on a phone. |
| `scripts/dev-mobile-tunnel.sh` | Compose up `-d`, waits for Next on `127.0.0.1:<SCOUT_WEB_HOST_PORT:-3000>`, runs Cloudflare Quick Tunnel (`cloudflared`), prints HTTPS URL (+ QR); `docker compose down` on EXIT. Mutates Compose state. | Geolocation/pwa-ish HTTPS parity on-device without punching two tunnels. Issue #46. |
