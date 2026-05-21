# Scout backend (`apps/backend`)

FastAPI surface area for Scout M1. See [`AGENTS.md`](./AGENTS.md) and [`docs/prompts/02-scaffold-backend-m1.md`](../../docs/prompts/02-scaffold-backend-m1.md).

## One-command dev server

From this directory (after [`uv`](https://docs.astral.sh/uv/) is installed):

```bash
uv sync && uv run uvicorn scout.main:app --reload --host 0.0.0.0 --port 8000
```

Uses `SCOUT_*` variables from `.env` (see `scout/config.py`). For local Postgres + PostGIS run Alembic first:

```bash
uv run alembic upgrade head
```

## Quality gate (matches CI expectations)

```bash
uv run ruff format scout tests && uv run ruff check scout tests
uv run mypy scout
uv run pytest
```

Tests set `SCOUT_UNDER_TEST=1` (offline Alembic/DB stubs). Do not weaken that guardrail for production deployments.
