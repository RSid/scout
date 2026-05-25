# Prompt: Scaffold the M1 FastAPI backend

## Role

You are a senior Python backend engineer. You scaffold a FastAPI application that
satisfies the M1 backend tickets in the Scout PRD. You write idiomatic, tested,
typed Python.

## Inputs (read these before touching code)

- `docs/02-prd.md` §6.1 (M1 tickets, especially F04, F07, F11, F12, F13).
- `docs/03-decisions.md` DEC-001 through DEC-020. **Pay special attention to
  DEC-020 (vendor-agnostic adapters) — every external service call goes
  through the adapter layout described there.**
- `docs/appendix-data-schema.md` (the normalized Feature schema and ingestion
  rules).
- The existing `pyproject.toml` (uv-managed; respect declared deps).
- The existing `main.py` (a stub — you will replace it).

## What to build

Create `apps/backend/` with this layout:

```
apps/backend/
├── pyproject.toml             # move dependencies here from root; ensure
│                              # geoalchemy2 + asyncpg are added
├── alembic.ini
├── alembic/
│   ├── env.py
│   ├── script.py.mako
│   └── versions/
│       └── 0001_initial_features_table.py
├── scout/
│   ├── __init__.py
│   ├── main.py                # FastAPI app; runs `alembic upgrade head`
│   │                          # on startup (idempotent)
│   ├── config.py              # pydantic-settings; env-driven
│   ├── api/
│   │   ├── __init__.py
│   │   ├── health.py          # GET /api/health
│   │   ├── categories.py      # GET /api/categories
│   │   ├── route.py           # POST /api/route  → calls ORS
│   │   ├── route_features.py  # POST /api/route-features → corridor query
│   │   └── restrooms.py       # GET /api/restrooms
│   ├── data/                  # persistence layer (DEC-019)
│   │   ├── __init__.py
│   │   ├── session.py         # SQLAlchemy engine + sessionmaker
│   │   ├── models.py          # SQLAlchemy + GeoAlchemy2 ORM models
│   │   ├── store.py           # query helpers: query_corridor(), etc.
│   │   ├── schema.py          # pydantic API models (distinct from ORM)
│   │   └── categories.py      # canonical category metadata
│   ├── clients/               # vendor-agnostic adapters per DEC-020
│   │   ├── __init__.py        # exports get_provider() factories
│   │   ├── routing/
│   │   │   ├── __init__.py
│   │   │   ├── protocol.py    # RoutingProvider Protocol
│   │   │   ├── openrouteservice.py
│   │   │   └── stub.py        # in-process fake for tests
│   │   ├── geocoding/
│   │   │   ├── __init__.py
│   │   │   ├── protocol.py    # GeocodingProvider Protocol + AddressHit
│   │   │   ├── local_dc.py    # LocalDcGeocodingProvider (DEC-023)
│   │   │   └── stub.py
│   │   └── restrooms/
│   │       ├── __init__.py
│   │       ├── protocol.py    # RestroomProvider Protocol
│   │       ├── refuge.py
│   │       └── stub.py
│   └── errors.py              # consistent error shape
├── tests/
│   ├── conftest.py            # FastAPI TestClient fixture; mocked HTTP for ORS/MAR ingest/RR
│   ├── test_health.py
│   ├── test_categories.py
│   ├── test_route.py
│   ├── test_route_features.py
│   └── test_restrooms.py
└── README.md                  # how to run locally
```

## Required behaviors

### `POST /api/route`

- Input: `{"from": [lon, lat], "to": [lon, lat], "profile": "wheelchair"}`.
- Calls ORS with the wheelchair profile.
- On `204`/no-route, retries with `foot-walking` and sets `fallback_profile_used:
  true` on the response.
- Response: a GeoJSON `FeatureCollection` containing the route LineString as
  the first feature, with properties `distance_meters`, `duration_seconds`,
  `fallback_profile_used`, and `warnings: [...]`.
- LRU cache: 256 entries, keyed by `(round(lon,4), round(lat,4))` of both
  endpoints + profile. 24-hour TTL.
- Failure modes mapped to friendly strings; see `errors.py`.

### `POST /api/route-features`

- Input: `{ "route_geometry": <LineString>, "buffer_meters": 30, "categories":
  ["curb_ramps","restrooms",...] }`.
- Implementation uses PostGIS via SQLAlchemy + GeoAlchemy2. See PRD §9.3 for
  the canonical SQL shape; use `ST_DWithin(geom, :line::geography, :buffer_m)`
  on the `geography(Point, 4326)` column so distances are in meters without
  per-query reprojection.
- Returns features that intersect the buffer, sorted by along-route distance
  (use `ST_LineLocatePoint(:line, point)` for accurate along-route ordering,
  not a straight-line distance from start).
- Caps at 500 features; includes `truncated: true` in metadata if exceeded.
- Each feature follows the normalized schema in
  `docs/appendix-data-schema.md` §A.
- Performance budget: median < 500 ms, p95 < 1.5 s for routes < 5 km. Add a
  `time_taken_ms` field to the response for observability. With the
  `features_geom_idx` GIST index from §9.2, the median should easily meet
  this; if it doesn't, profile before adding caches.

### `GET /api/categories`

- Returns the list defined in `docs/appendix-data-schema.md` §A. Each entry has
  `id`, `label`, `description`, `kind`, `default_enabled` (boolean, M1-aware).

### `GET /api/restrooms`

- Input: `?bbox=west,south,east,north`.
- Returns cached Refuge Restrooms entries (ADA + DC) intersecting the bbox,
  normalized per §B.8 of the data schema.

### `GET /api/health`

- Returns `{"status":"ok","db":"up","features": N,"checked_at": "ISO8601"}`.
- DB check: `SELECT 1` for liveness; cached `SELECT count(*) FROM features`
  (60 s cache) for visibility.
- If DB is unreachable, returns HTTP 503 with `db: "down"` and the same
  shape.
- Used as the Fly health check for the app VM.

### Data layer (`scout/data/`)

- `models.py`: GeoAlchemy2-backed ORM model `Feature` mirroring the DDL in
  PRD §9.2. Use `geography(Point, 4326)`, not `geometry`. Add table args for
  the three indexes.
- `session.py`: standard SQLAlchemy 2.x async engine + `async_sessionmaker`.
  Connection URL from `SCOUT_DATABASE_URL`; reasonable pool defaults
  (pool_size=5, max_overflow=5).
- `store.py`: exposes async query functions, the most important being
  `query_corridor(line: shapely.LineString, buffer_m: int, categories:
  list[str]) -> list[Feature]`. Implementation uses SQL as in PRD §9.3.
- App startup runs `alembic upgrade head` so the schema is always current
  (idempotent; safe to re-run). Log the migration result.

### Configuration (`scout/config.py`)

Env vars, all optional with sensible defaults:

- `SCOUT_DATABASE_URL` — required; e.g.
  `postgresql+asyncpg://scout:***@db:5432/scout` (dev) or
  `postgresql+asyncpg://scout:***@scout-pg.internal:5432/scout` (Fly).
- **Provider selection** (one env var per concern; defaults pick the real impl):
  - `SCOUT_ROUTING_PROVIDER` — `openrouteservice` (default) | `stub`
  - `SCOUT_GEOCODING_PROVIDER` — `local_dc` (default per DEC-023) | `stub`
  - `SCOUT_RESTROOMS_PROVIDER` — `refuge` (default) | `stub`
- **Provider-specific config** (only read by the relevant adapter):
  - `SCOUT_ORS_BASE_URL` — default `https://api.openrouteservice.org`.
  - `SCOUT_ORS_API_KEY` — required for the openrouteservice provider in prod.
  - `SCOUT_REFUGE_BASE_URL` — default `https://www.refugerestrooms.org/api/v1`.
- `SCOUT_CACHE_DIR` — default `./.scout-cache`.
- `SCOUT_LOG_LEVEL` — default `INFO`.

### Errors (`scout/errors.py`)

Consistent shape:

```json
{"error": {"code": "ROUTE_NOT_FOUND", "message": "We couldn't find a walkable route…"}}
```

### Adapter design rules (apply per DEC-020)

- Each protocol module (`clients/<concern>/protocol.py`) defines a `Protocol`
  whose methods speak in **Scout-domain types** (`Route`, `Address`, `Restroom`)
  — never in vendor-wire types.
- Vendor-specific error codes are translated to Scout error codes at the adapter
  boundary, not at the caller.
- Vendor-specific caching and rate-limiting live **inside** the adapter; the
  caller doesn't know.
- A `stub` adapter exists for every concern and is what tests use. The stub is
  deterministic, in-process, and zero-IO.
- The factory in `clients/__init__.py` reads the `SCOUT_*_PROVIDER` env var and
  returns the matching adapter instance; it is the only place that imports the
  concrete adapter modules.

## Tests

- Use `httpx.AsyncClient(app=app)` against the FastAPI app.
- **Replace adapters with their `stub` siblings via dependency override.** This
  is the primary test isolation strategy; `respx` / `httpx_mock` is a secondary
  tool for testing the *real* adapters' translation logic.
- Coverage target: 70% line on `apps/backend/scout/`.
- One contract test per endpoint asserts the response schema (validate against the
  pydantic model used by the endpoint).
- **Per `<user_rule>`: when you mock anything, add a one-line comment
  `# MOCK: <what and why>` and surface the list of mocks in the PR description
  for the owner to review.**

## Style

- `ruff` for lint + format (config in `pyproject.toml`).
- Type hints everywhere. `mypy --strict` clean.
- Functions < 50 lines. Modules < 300 lines.
- No mutable default args, no global state besides the cached store singleton.

## Don't

- Don't add Celery, Redis, or any worker queue.
- Don't import the data schema definitions directly from the geojson files at
  request time — they come pre-loaded into PG via `scripts/ingest_dc.py`.
- Don't call ORS, Refuge Restrooms, or OCTO GIS in ordinary tests (use the stub
  adapters).
- Don't reach for ORM lazy loading across requests. All queries are explicit;
  N+1 patterns are a review-blocker.
- Don't open multiple SQLAlchemy engines. One engine, one sessionmaker, per
  process.

## Deliverable

A working `apps/backend/` that passes `pytest`, `mypy --strict`, and
`ruff check`, plus a `README.md` with one-command run instructions.
Commit message: `feat(backend): scaffold M1 FastAPI app per PRD §6.1`.
