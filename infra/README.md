# Infra (M1-T05a)

Host-agnostic local Docker stack and packaging artifacts. Fly.io-specific
deploy machinery is deferred — see [issue
#6](https://github.com/grow-therapy/scout/issues/6) (M1-T05b).

## Files

| Path | Purpose |
| --- | --- |
| `Dockerfile` | Multi-stage app image (deps-backend, builder-web, builder-tiles, dev-backend, dev-web, runtime). |
| `Dockerfile.postgres` | PostGIS pinned by sha256 per DEC-006. |
| `docker-compose.yml` | Local dev stack: `db`, `backend`, `web`, and a profile-gated `ingest` no-op. |
| `start.sh` | Production entrypoint — runs Alembic, uvicorn, and the Next standalone server side-by-side. |
| `.dockerignore` | Keeps caches, lockable outputs, and editor cruft out of every build context. |

## Quickstart

From the repo root:

```bash
make docker-up        # builds and starts db + backend + web
open http://localhost:3000
make docker-down      # stops everything, preserves the pgdata volume
```

Raw equivalents (if you do not have `make`):

```bash
docker compose --project-directory . -f infra/docker-compose.yml up -d --build
docker compose --project-directory . -f infra/docker-compose.yml down
```

> **Use `http://`, not `https://`.** The dev stack has no TLS terminator;
> the Next.js dev server and uvicorn speak plain HTTP. Firefox in particular
> renders an `https://localhost:3000` attempt as `NS_ERROR_CONNECTION_REFUSED`
> because HTTPS-Only Mode upgrades the URL before the request is sent.

## Local URLs

The defaults below match a stock `make docker-up`. If you set any
`SCOUT_*_HOST_PORT` overrides in `.env`, swap the host port accordingly —
paths are unchanged.

### Web (Next.js, default `:3000`)

| Path | What's there |
| --- | --- |
| `http://localhost:3000/`        | Landing page — pitch, disclaimer, link into planner. |
| `http://localhost:3000/plan`    | The map + corridor planner (M1-F04 / M1-F05). Most interactive surface. |
| `http://localhost:3000/about`   | About Scout. |
| `http://localhost:3000/privacy` | Privacy notice. |
| `http://localhost:3000/manifest.webmanifest` | PWA manifest. |

### Backend (FastAPI, default `:8080`)

| Method + path | What it does |
| --- | --- |
| `GET  /api/health`         | Liveness probe; returns `{status, db, features, checked_at}`. |
| `GET  /api/categories`     | Feature category taxonomy used by the profile panel. |
| `POST /api/route`          | Compute a walking route (M1-F04). |
| `POST /api/route-features` | Features along a route corridor (M1-F05). |
| `GET  /api/restrooms`      | Restrooms in a bbox (M1-F08). |
| `GET  /docs`               | FastAPI auto-generated Swagger UI. |
| `GET  /redoc`              | FastAPI ReDoc rendering of the OpenAPI spec. |
| `GET  /openapi.json`       | The raw OpenAPI 3.x schema. |

### Database (PostGIS, default `:5432`)

DSN for host-side tools (psql, DBeaver, datagrip):

```
postgresql://scout:scout@localhost:5432/scout
```

Inside Compose the bridge-network DSN is
`postgresql+asyncpg://scout:scout@db:5432/scout`; the backend uses that
one automatically. The container-internal port is always `5432` — only
the host-side mapping moves when you set `SCOUT_DB_HOST_PORT`.

## Service map

| Service | Default host port | Override | Notes |
| --- | --- | --- | --- |
| `db`      | `5432` | `SCOUT_DB_HOST_PORT`      | PostGIS 16 + 3.4. Volume `pgdata` persists across restarts. |
| `backend` | `8080` | `SCOUT_BACKEND_HOST_PORT` | `uv run uvicorn ... --reload`. Source bind-mounted; venv in named volume `backend-venv`. |
| `web`     | `3000` | `SCOUT_WEB_HOST_PORT`     | `npm run dev`. Source bind-mounted; `node_modules` + `.next` in named volumes. |
| `ingest`  | n/a    | —                          | `--profile ingest`. Currently a no-op echo; swaps to real ingest scripts when M1-F02 lands. |

Container-internal ports stay fixed (`5432`, `8080`, `3000`) so the
backend → `db:5432` bridge DSN never moves; only the host side of each
mapping is overridable. Set them in `.env` at the repo root, or inline:

```bash
SCOUT_DB_HOST_PORT=5433 make docker-up
# or persist:
echo SCOUT_DB_HOST_PORT=5433 >> .env
```

The web container's `NEXT_PUBLIC_SCOUT_API_BASE_URL` is wired through the
same variable, so overriding `SCOUT_BACKEND_HOST_PORT` correctly routes
browser-side fetches to the new host port.

## Resetting the database

```bash
docker compose -f infra/docker-compose.yml down -v   # drops the pgdata volume
make docker-up                                       # re-runs alembic via the backend lifespan
```

## Production image (runtime stage)

The default `docker build -f infra/Dockerfile .` target is `runtime`,
which produces a single image that boots:

1. `alembic upgrade head`
2. `uvicorn scout.main:app` on `:8080`
3. `node server.js` (Next.js standalone) on `:3000`

A reverse proxy in front of this image is responsible for `/api/*` →
`:8080` and `/*` → `:3000`. Provisioning that proxy is M1-T05b's
problem; locally we hit each port directly.

## Validating without booting

```bash
docker compose -f infra/docker-compose.yml config       # syntax + interpolation
docker build -f infra/Dockerfile --target dev-backend . # cheap layer test
docker build -f infra/Dockerfile .                       # full runtime build
```

CI runs the same `docker build .` invocation on every push (see
`.github/workflows/ci.yml`).

## Size budget

Current measurements (linux/arm64, Docker Desktop 4.x):

| | uncompressed | compressed (gzip -1) |
| --- | --- | --- |
| `runtime` | ~376 MB | ~144 MB |

This sits under the `< 200 MB compressed` ceiling from the M1-T05a issue.
The two trims that made it possible:

- `COPY --chown=...` at every COPY step instead of a trailing `chown -R /app`,
  which would otherwise duplicate every file (~170 MB on this stack).
- Direct Node tarball install (SHA-pinned per arch) instead of the
  NodeSource apt setup (~140 MB savings).

If you bump base images or add deps that move the needle, re-measure with:

```bash
docker save <image-id> | gzip -1 | wc -c
```

## Refreshing the PostGIS digest

Docker Hub rolls patches under `postgis/postgis:16-3.4` without changing
the tag. Re-pin the digest in `Dockerfile.postgres` when a CVE drops or
quarterly, whichever comes first:

```bash
docker buildx imagetools inspect postgis/postgis:16-3.4
```

Copy the `Digest:` line into the `FROM ... @sha256:...` reference.
