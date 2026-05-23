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
| `docker-compose.mobile.yml` | Compose **overlay**: same-origin `/api/*` via Next rewrites (`SCOUT_BACKEND_INTERNAL_URL`); pair both `-f`s — see §Testing on a phone. |
| `start.sh` | Production entrypoint — runs Alembic, uvicorn, and the Next standalone server side-by-side. |
| `.dockerignore` | Keeps caches, lockable outputs, and editor cruft out of every build context. |

## DC vector tiles (`dc.pmtiles`)

The web image bundles a Protomaps PMTiles extract for the District (DEC-002).
The Dockerfile `builder-tiles` stage runs [`scripts/build_pmtiles.sh`](../scripts/build_pmtiles.sh)
with the `SCOUT_PROTOMAPS_BUILD_DATE` pin baked into that stage. Locally, install the
[`pmtiles` CLI](https://github.com/protomaps/go-pmtiles/releases) and run the same script
to materialize [`apps/web/public/tiles/dc.pmtiles`](../apps/web/public/tiles/README.md).

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

## Testing on a phone

Phones resolve `localhost` as the handset itself. The stock web container sets `NEXT_PUBLIC_SCOUT_API_BASE_URL=http://localhost:8080`; cross-device, that sends API calls nowhere useful unless traffic is consolidated to **one origin** — the hostname + port you open on the phone.

Opt-in wiring (GitHub [issue #46](https://github.com/RSid/scout/issues/46)) adds [`docker-compose.mobile.yml`](docker-compose.mobile.yml):

- clears `NEXT_PUBLIC_SCOUT_API_BASE_URL` so the browser hits same-origin `/api/*`;
- sets `SCOUT_BACKEND_INTERNAL_URL=http://backend:8080`, which activates [`apps/web/next.config.ts`](../apps/web/next.config.ts) rewrites `/api/:path*` → `$SCOUT_BACKEND_INTERNAL_URL/api/:path*`.

Two Make targets mirror the Compose commands:

| Goal | Target | HTTPS? |
| --- | --- | --- |
| Fast Wi-Fi LAN UI checks | [`make dev-mobile-lan`](../Makefile) | Plain `http://<LAN-ip>:<port>` (Geolocation/install-to-home-screen may not behave like HTTPS production). |
| Geolocation button + HTTPS parity | [`make dev-mobile-tunnel`](../Makefile) | `https://*.trycloudflare.com` Quick Tunnel (**ephemeral URL** exposing your laptop's dev Next port). Requires `cloudflared` (`brew install cloudflare/cloudflare/cloudflared`). Stops cleanly on Ctrl+C (`docker compose … down`). |

Raw Compose (either flow):

```bash
docker compose --project-directory . \
  -f infra/docker-compose.yml -f infra/docker-compose.mobile.yml up
```

Tunnel flow stacks `docker compose … up -d`, waits for Next at `http://127.0.0.1:<SCOUT_WEB_HOST_PORT>/` (same default as Compose: `:3000`), starts `cloudflared`, echoes the HTTPS URL (+ ASCII QR when `qrencode` is installed), then drains `cloudflared` until Ctrl+C.

**Alternative:** [mkcert](https://github.com/FiloSottile/mkcert) + a LAN reverse-proxy gives HTTPS **without** a quick tunnel, but every device needs the issuer CA trusted.

## Local URLs

The defaults below match a stock `make docker-up`. If you set any
`SCOUT_*_HOST_PORT` overrides in `.env`, swap the host port accordingly —
paths are unchanged.

### Web (Next.js, default `:3000`)

| Path | What's there |
| --- | --- |
| `http://localhost:3000/`        | Landing page — pitch + CTA to planner (full disclaimer/data sources live on `/about`). |
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

## Troubleshooting

| Symptom | Likely cause | First thing to try |
| --- | --- | --- |
| Page shows "The interactive map is in stub mode." | `infra/docker-compose.yml` pins `NEXT_PUBLIC_SCOUT_MAP_MODE: stub` for the `web` service. | Build `apps/web/public/tiles/dc.pmtiles` (see [tiles/README](../apps/web/public/tiles/README.md)), then override the env var for the run: `docker compose --project-directory . -f infra/docker-compose.yml run --rm --service-ports -e NEXT_PUBLIC_SCOUT_MAP_MODE=interactive web`. |
| `Module not found: <pkg>` in the `web` container after editing `package.json` | The `web-node_modules` named volume keeps the old `node_modules` across rebuilds. | `make docker-reset-web-deps && docker compose --project-directory . -f infra/docker-compose.yml up --build` (see next section). |
| `pmtiles: command not found` or `HTTP error: 404` from `scripts/build_pmtiles.sh` | The `pmtiles` CLI isn't on `$PATH`, or the pinned daily build has rotated off `build.protomaps.com`. | See [apps/web/public/tiles/README — Troubleshooting](../apps/web/public/tiles/README.md#troubleshooting). |
| `CORS header 'Access-Control-Allow-Origin' missing` in the browser for `/api/*` | Backend `SCOUT_CORS_ALLOWLIST_CSV` is empty or doesn't include the web origin (port mismatch with `SCOUT_WEB_HOST_PORT`). | Compose interpolates the dev origin from `SCOUT_WEB_HOST_PORT`; if you set that override **after** the backend container started, recreate it: `docker compose --project-directory . -f infra/docker-compose.yml up -d --force-recreate backend`. |
| Firefox shows `NS_ERROR_CONNECTION_REFUSED` at `https://localhost:3000` | HTTPS-Only Mode upgrades the URL before the request lands. | Use `http://localhost:3000` — the dev stack has no TLS terminator. |

## Resetting web `node_modules` (Compose)

The `web` service bind-mounts `apps/web/` for hot reload, **but overlays
`node_modules` and `.next` with Docker named volumes** so Linux binaries stay
inside the container. That means **`npm install` on your Mac only fixes your
machine** — it never updates those volumes.

When you change `apps/web/package.json` / lockfile or see `Module not found`
for an installed dependency in Docker, recreate the volumes and rebuild:

```bash
make docker-reset-web-deps
docker compose --project-directory . -f infra/docker-compose.yml up --build
```

(`make docker-up` does not pass `--build`; add it after dependency changes.)

If volume names differ (non-default Compose project name), inspect
`docker volume ls` and remove the `*-web-node_modules` and `*-web-next`
entries manually while containers are stopped.

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
