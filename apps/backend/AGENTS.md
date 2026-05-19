# apps/backend/AGENTS.md

Python backend conventions. Read `../../AGENTS.md` first.

## Stack and tooling

- **Python ≥ 3.12** (matches `pyproject.toml`; the architecture targets 3.12
  per PRD §8).
- **`uv`** for env and dependency management. Add deps with `uv add`; never
  hand-edit `pyproject.toml` for version pins.
- **`ruff`** for lint + format (config in `pyproject.toml`). Format on save.
- **`mypy --strict`** must pass on `apps/backend/scout/`. No `Any` without a
  `# type: ignore[reason]` and a one-line comment.
- **FastAPI** for HTTP, **SQLAlchemy 2.x async** for ORM, **GeoAlchemy2** for
  PostGIS, **Alembic** for migrations, **Pydantic v2** for boundaries,
  **`pydantic-settings`** for config.

## Typing and validation

- **Pydantic at every external boundary.** Inbound JSON, outbound JSON, env
  vars, file inputs. Internal helpers can use plain dataclasses or named
  tuples when Pydantic is overkill.
- **Keep Pydantic models separate from SQLAlchemy ORM models.** API schemas
  live in `scout/data/schema.py`; ORM models live in `scout/data/models.py`.
  Convert at the boundary.
- **`frozen=True` and `model_config = {"strict": True}`** on request and
  response models. Mutability is a bug magnet at the API boundary.
- **Type aliases for domain primitives** when they earn it: `type FeatureId
  = str`, `type Latitude = float`. Don't over-do it.

## Async

- **The HTTP layer is async end-to-end.** `async def` for handlers;
  `asyncpg` + `async_sessionmaker` for the DB.
- Never call sync `requests` from a handler — use `httpx.AsyncClient`. The
  exception is offline scripts in `scripts/`, which are sync.
- Background work in M1 stays inline. If you need a queue, surface the need;
  don't add Celery without a written decision.

## Module and function size

- Functions < 50 lines. Modules < 300 lines. Hitting either is a signal to
  split, not to refactor for cleverness.
- One class per file when the class is the file's reason to exist.

## Dependency injection

- Use FastAPI `Depends()` for everything a handler needs: DB session,
  current config, adapter providers.
- **No module-level state besides the cached store singleton and the adapter
  factory.** If you reach for a global, write a `Depends` instead.
- The adapter factory in `clients/__init__.py` is the *only* place that
  imports concrete vendor adapters (per DEC-020).

## Vendor-agnostic adapters (DEC-020)

This is the most important pattern in the backend. Read DEC-020 in full.

- Every external service goes through `scout/clients/<concern>/protocol.py`
  (a `typing.Protocol`).
- Adapter methods speak Scout-domain types (`Route`, `Address`, `Restroom`).
  Never expose vendor wire types upward.
- Translate vendor error codes to Scout error codes at the adapter boundary.
- Caching and rate-limiting on outbound calls live inside the adapter.
- Every concern has a `stub` sibling for tests. Tests use the stub.

## Errors

- A small custom exception hierarchy rooted at `ScoutError`, each with a
  stable `code` field (e.g., `ROUTE_NOT_FOUND`, `UPSTREAM_TIMEOUT`,
  `INVALID_INPUT`).
- A FastAPI exception handler translates `ScoutError` to the canonical
  `{"error": {"code", "message"}}` shape from PRD §6.1.
- **Never leak vendor error codes or stack traces to API responses.** Log
  internally; return a Scout code.
- HTTP 4xx for client errors, 5xx for server errors, 503 for upstream
  unavailable.

## Logging

The library is the implementing agent's choice. The patterns are not.

- **Structured** (key-value or JSON), not free-form. A log line is a row in
  a hypothetical table.
- **Always include**: request id, route, status, `duration_ms`, the
  user-facing error code (if any), and a small set of business metrics
  (feature count, cache hit/miss).
- **Never include** (see root AGENTS.md "Security and privacy posture"):
  API keys, full request bodies, raw addresses, emails, IPs (after their
  7-day retention), tokens.
- **Use log levels as the verbs they are.** `DEBUG` for development noise;
  `INFO` for normal operation; `WARNING` for recoverable upstream issues;
  `ERROR` for handler failures; `CRITICAL` for "the app is wrong, page me".

## Configuration

- One `Settings` class (`pydantic-settings.BaseSettings`) with env-var-backed
  fields, `SCOUT_` prefix.
- Loaded once at app startup, injected via `Depends`. No re-reading env vars
  at request time.
- Sensible dev defaults; required-in-prod fields raise on startup with a
  clear message rather than failing at first use.

## Database and migrations

- **Alembic owns the schema.** App startup runs `alembic upgrade head`
  (idempotent). Never `CREATE TABLE` outside a migration.
- **Never edit an applied migration.** Add a new one.
- **One conceptual change per migration.** Schema-only and data-only
  migrations are separate files.
- Use `geography(Point, 4326)` for points, not `geometry`. Distances stay in
  meters without per-query reprojection (DEC-019).
- No ORM lazy-loading across requests. All queries are explicit. N+1
  patterns are a review-blocker.
- One engine, one sessionmaker, per process.

## Tests

- `pytest`, `pytest-randomly`, `pytest-cov`, `httpx.AsyncClient(app=app)`.
  No ad-hoc test runners.
- **One behavior per test.** Single assertion statement preferred. Parameterize
  with `@pytest.mark.parametrize` over loops or copy-paste.
- **Stub adapters from DEC-020 are the primary isolation strategy.** Override
  providers via FastAPI dependency overrides. `respx` / `httpx_mock` is a
  secondary tool for testing *real* adapters' translation logic.
- Every endpoint has at least one contract test asserting its response
  schema (against the Pydantic model the endpoint declares).
- 70% line coverage floor on `apps/backend/scout/`.
- Mocks obey the visibility rule in the root `AGENTS.md` (rule #3).

## Don'ts

- Don't add Celery, Redis, Kafka, or any message queue.
- Don't add an ORM other than SQLAlchemy 2.x.
- Don't introduce a second HTTP client; standardize on `httpx`.
- Don't catch bare `Exception` without re-raising or re-mapping. Narrow
  `except` clauses.
- Don't log inside hot inner loops without rate-limiting the log line itself.
- Don't import data-schema definitions from the GeoJSON files at request
  time — they are pre-loaded into Postgres via `scripts/ingest_dc.py`.
