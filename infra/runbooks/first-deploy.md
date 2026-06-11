# Runbook: first deploy (host-neutral)

Brings Scout up on a fresh environment. This runbook is **provider-agnostic**
per `DEC-025`: Scout deploys to any host that can run an OCI/Docker image and
reach a PostgreSQL 16 + PostGIS database. Provider-specific notes are an
appendix in [`docs/prompts/06-dockerize-and-deploy.md`](../../docs/prompts/06-dockerize-and-deploy.md);
the green-host options are evaluated in
[`docs/proposals/green-hosting-shortlist.md`](../../docs/proposals/green-hosting-shortlist.md).

## What gets deployed

A single runtime image (built from [`infra/Dockerfile`](../Dockerfile),
target `runtime`) that serves everything behind **one HTTP port**:

- An in-image **Caddy** proxy listens on `$PORT` and routes `/api/*` to the
  FastAPI backend (loopback `:8081`) and everything else to the Next.js
  standalone server (loopback `:3000`). See [`infra/Caddyfile`](../Caddyfile).
- On startup the backend runs `alembic upgrade head`, so schema changes ship
  with the image.
- The DC vector basemap (`/tiles/dc.pmtiles`) is baked into the image.

The database is separate and reached only via `SCOUT_DATABASE_URL`.

## Environment contract

The image is configured entirely through env vars (`SCOUT_` prefix; see
[`apps/backend/scout/config.py`](../../apps/backend/scout/config.py)). The full
set for a production deploy:

| Variable | Required? | Purpose |
| --- | --- | --- |
| `SCOUT_DATABASE_URL` | **Yes** | Async Postgres DSN, e.g. `postgresql+asyncpg://scout:<pw>@<host>:5432/scout`. The only DB coupling. |
| `PORT` | No (default `8080`) | Public port Caddy listens on. Managed platforms (Cloud Run, Render) inject this automatically. |
| `SCOUT_ORS_API_KEY` | Yes, if routing is real | OpenRouteService key (omit only when `SCOUT_ROUTING_PROVIDER=stub`). |
| `SCOUT_ROUTING_PROVIDER` | No (default `openrouteservice`) | `openrouteservice` \| `stub`. |
| `SCOUT_GEOCODING_PROVIDER` | No (default `local_dc`) | `local_dc` (bundled DC MAR) \| `stub`. |
| `SCOUT_RESTROOMS_PROVIDER` | No (default `refuge`) | `refuge` \| `stub`. |
| `SCOUT_TRUST_PROXY_HEADERS` | No (default `false`) | Set `true` so the rate limiter reads the real client IP from the edge header. |
| `SCOUT_CLIENT_IP_HEADER` | No (default `X-Forwarded-For`) | The header carrying the client IP. Behind the in-image Caddy it is `X-Forwarded-For`; set to your edge's header if different (e.g. `Cf-Connecting-IP` on Cloudflare). **No code change to switch hosts.** |
| `SCOUT_CORS_ALLOWLIST_CSV` | No (default empty = closed) | Leave empty: the browser calls `/api` on the **same origin** as the app, so CORS is not needed. |
| `SCOUT_LOG_LEVEL` | No (default `INFO`) | Log verbosity. |

Secrets (`SCOUT_DATABASE_URL`, `SCOUT_ORS_API_KEY`) come from the host's secret
store, never the image.

> **Same-origin frontend.** Because Caddy serves the app and the API on one
> origin, the browser should call the API with a **relative** base URL. Build
> the web image without `NEXT_PUBLIC_SCOUT_API_BASE_URL` (or set it empty) so
> requests go to `/api/*` on the current origin. `NEXT_PUBLIC_*` values are
> inlined at build time, so this is a build-arg decision, not a runtime one.

## Path A — single VPS (Docker Compose)

Use [`infra/docker-compose.prod.yml`](../docker-compose.prod.yml). The host has
the repo checked out (needed for the build context and the data/scripts bind
mounts used by ingest).

```bash
# 1. Configure secrets
cp .env.example .env
#    set SCOUT_DB_PASSWORD=<strong password>
#    set SCOUT_ORS_API_KEY=<your ORS key>

# 2. Build + start the app and database
docker compose -f infra/docker-compose.prod.yml up -d --build
#    (the app runs `alembic upgrade head` automatically on boot)

# 3. First deploy only — load data (idempotent UPSERTs)
docker compose -f infra/docker-compose.prod.yml --profile ingest run --rm ingest-features
docker compose -f infra/docker-compose.prod.yml --profile ingest run --rm ingest-addresses

# 4. Verify
curl -fsS http://localhost:${SCOUT_HTTP_PORT:-8080}/api/health
open  http://localhost:${SCOUT_HTTP_PORT:-8080}/
```

**TLS.** The in-image Caddy serves plain HTTP (`auto_https off`) because a
front layer terminates TLS. On a bare VPS, put a TLS terminator in front:
Cloudflare proxy (free), or an outer Caddy/nginx with a cert for your domain
proxying to `127.0.0.1:${SCOUT_HTTP_PORT}`.

## Path B — managed platform (Cloud Run / Render / etc.)

The image is the same; you provide the proxy/TLS and a managed Postgres.

```bash
# 1. Build + push the runtime image to the platform's registry
docker build -f infra/Dockerfile -t <registry>/scout:<tag> .
docker push <registry>/scout:<tag>

# 2. Provision a managed PostgreSQL + PostGIS instance, then enable PostGIS once:
#    CREATE EXTENSION IF NOT EXISTS postgis;

# 3. Deploy the image as a service. Set the env vars from the contract above;
#    the platform injects $PORT and terminates TLS. The container runs
#    `alembic upgrade head` on boot.

# 4. First deploy only — run the ingest scripts ONCE against the managed DB.
#    These scripts are sync and connect directly via SCOUT_DATABASE_URL, so
#    run them from CI or your laptop (they are not in the runtime image):
PYTHONPATH=apps/backend SCOUT_DATABASE_URL='postgresql+asyncpg://...' \
  python scripts/ingest_dc.py
PYTHONPATH=apps/backend SCOUT_DATABASE_URL='postgresql+asyncpg://...' \
  python scripts/ingest_dc_addresses.py

# 5. Verify
curl -fsS https://<your-service-host>/api/health
```

## Re-deploys

Push a new image (or `docker compose ... up -d --build`). Migrations run on
boot. Data ingest is **not** repeated unless the database volume was recreated
or a data refresh is intended (see
[`refresh-dc-addresses.md`](refresh-dc-addresses.md)).

## Before production cutover

Complete the **Third-party TOS review** for the chosen host (AGENTS.md rule
#12). The checklist lives in
[`docs/proposals/green-hosting-shortlist.md`](../../docs/proposals/green-hosting-shortlist.md) §6.
