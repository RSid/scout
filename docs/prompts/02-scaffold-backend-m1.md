# Prompt: Scaffold the M1 FastAPI backend

## Role

You are a senior Python backend engineer. You scaffold a FastAPI application that
satisfies the M1 backend tickets in the Scout PRD. You write idiomatic, tested,
typed Python.

## Inputs (read these before touching code)

- `docs/02-prd.md` §6.1 (M1 tickets, especially F04, F07, F11, F12, F13).
- `docs/03-decisions.md` DEC-001 through DEC-018.
- `docs/appendix-data-schema.md` (the normalized Feature schema and ingestion
  rules).
- The existing `pyproject.toml` (uv-managed; respect declared deps).
- The existing `main.py` (a stub — you will replace it).

## What to build

Create `apps/backend/` with this layout:

```
apps/backend/
├── pyproject.toml             # move dependencies here from root
├── scout/
│   ├── __init__.py
│   ├── main.py                # FastAPI app instance
│   ├── config.py              # pydantic-settings; env-driven
│   ├── api/
│   │   ├── __init__.py
│   │   ├── health.py          # GET /api/health
│   │   ├── categories.py      # GET /api/categories
│   │   ├── route.py           # POST /api/route  → calls ORS
│   │   ├── route_features.py  # POST /api/route-features → corridor query
│   │   └── restrooms.py       # GET /api/restrooms
│   ├── data/
│   │   ├── __init__.py
│   │   ├── store.py           # in-memory STRtree-backed Feature store
│   │   ├── schema.py          # pydantic models for Feature, Route, etc.
│   │   └── categories.py      # the canonical category metadata
│   ├── clients/
│   │   ├── __init__.py
│   │   ├── ors.py             # OpenRouteService client (with fallback profile)
│   │   ├── nominatim.py       # geocoding client (rate-limited)
│   │   └── refuge_restrooms.py
│   └── errors.py              # consistent error shape
├── tests/
│   ├── conftest.py            # FastAPI TestClient fixture; mocked HTTP for ORS/Nominatim/RR
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
- Buffers the LineString in projected coordinates (use a DC-local UTM zone 18N
  projection, then back to WGS84).
- Returns features that intersect the buffer, sorted by along-route distance.
- Caps at 500 features; includes `truncated: true` in metadata if exceeded.
- Each feature follows the normalized schema in
  `docs/appendix-data-schema.md` §A.
- Performance budget: median < 500 ms, p95 < 1.5 s for routes < 5 km. Add a
  `time_taken_ms` field to the response for observability.

### `GET /api/categories`

- Returns the list defined in `docs/appendix-data-schema.md` §A. Each entry has
  `id`, `label`, `description`, `kind`, `default_enabled` (boolean, M1-aware).

### `GET /api/restrooms`

- Input: `?bbox=west,south,east,north`.
- Returns cached Refuge Restrooms entries (ADA + DC) intersecting the bbox,
  normalized per §B.8 of the data schema.

### `GET /api/health`

- Returns `{"status":"ok","store_features": N,"store_ready_at": "ISO8601"}`.
- Used as the Fly health check.

### Data layer (`scout/data/store.py`)

- On startup, loads the pre-built features file (from `scripts/ingest_dc.py`
  output; default path overridable by env var `SCOUT_FEATURES_PATH`).
- Builds a `shapely.strtree.STRtree` index keyed by feature `id`.
- Exposes `query_corridor(geometry, buffer_m, categories) -> list[Feature]`.
- Reports startup time and feature count via a structured log line.

### Configuration (`scout/config.py`)

Env vars, all optional with sensible defaults:

- `SCOUT_FEATURES_PATH` — path to the ingested features artifact.
- `SCOUT_ORS_BASE_URL` — default `https://api.openrouteservice.org`.
- `SCOUT_ORS_API_KEY` — required for prod.
- `SCOUT_NOMINATIM_BASE_URL` — default `https://nominatim.openstreetmap.org`.
- `SCOUT_REFUGE_BASE_URL` — default `https://www.refugerestrooms.org/api/v1`.
- `SCOUT_CACHE_DIR` — default `./.scout-cache`.
- `SCOUT_LOG_LEVEL` — default `INFO`.

### Errors (`scout/errors.py`)

Consistent shape:

```json
{"error": {"code": "ROUTE_NOT_FOUND", "message": "We couldn't find a walkable route…"}}
```

## Tests

- Use `httpx.AsyncClient(app=app)` against the FastAPI app.
- Mock outbound HTTP with `respx` or `httpx_mock`. No real network in CI.
- Coverage target: 70% line on `apps/backend/scout/`.
- One contract test per endpoint asserts the response schema (validate against the
  pydantic model used by the endpoint).

## Style

- `ruff` for lint + format (config in `pyproject.toml`).
- Type hints everywhere. `mypy --strict` clean.
- Functions < 50 lines. Modules < 300 lines.
- No mutable default args, no global state besides the cached store singleton.

## Don't

- Don't add a database in M1 (per DEC-004).
- Don't add Celery, Redis, or any worker queue.
- Don't import the data schema definitions directly from the geojson files at
  request time — they come pre-built from the ingestion step.
- Don't call ORS, Nominatim, or Refuge Restrooms in tests.

## Deliverable

A working `apps/backend/` that passes `pytest`, `mypy --strict`, and
`ruff check`, plus a `README.md` with one-command run instructions.
Commit message: `feat(backend): scaffold M1 FastAPI app per PRD §6.1`.
