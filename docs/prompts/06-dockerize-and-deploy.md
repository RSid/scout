# Prompt: Dockerize Scout and deploy to Fly.io

## Role

You are a senior DevOps engineer. You package Scout into a single, small Docker
image and configure Fly.io deployment + CI.

## Inputs (read these before coding)

- `docs/02-prd.md` §6.1 ticket M1-F15 and §7.2 (Performance).
- `docs/03-decisions.md` DEC-006, DEC-011, DEC-016, DEC-017, **DEC-019
  (sibling Postgres VM topology — read this carefully)**.

## What to build

```
infra/
├── Dockerfile                 # app: multi-stage; final image runs API + web
├── Dockerfile.postgres        # PG VM: pins postgis/postgis:16-3.4 by digest
├── docker-compose.yml         # local dev: app + web + postgis + healthcheck
├── fly.app.toml               # Fly.io app VM config
├── fly.postgres.toml          # Fly.io Postgres VM config (sibling app)
├── runbooks/
│   └── first-deploy.md        # bring up PG VM, set secrets, run migrations,
│                              # run scripts/ingest_dc.py
├── .dockerignore
└── README.md                  # how to build, run, deploy

.github/workflows/
├── ci.yml                     # PR checks: tests, lint, axe (with PG service)
└── deploy.yml                 # push to main → Fly deploy of the APP VM only
                               # (PG VM is deployed manually + rarely)
```

## Required behaviors

### Dockerfile (app, multi-stage)

1. **`builder-web`** (Node): installs frontend deps, runs `pnpm build`,
   outputs `apps/web/.next/standalone` + `static` + `public`.
2. **`builder-tiles`**: runs `scripts/build_pmtiles.sh` (which uses
   `tippecanoe` or fetches a pre-built DC PMTiles extract from Protomaps).
3. **`runtime`** (Python slim-bookworm): copies the API code, the Alembic
   migrations, the built Next.js standalone bundle, and the PMTiles file.
   Runs a small process supervisor (`honcho` or `s6-overlay`) that starts:
   - `uvicorn scout.main:app --host 0.0.0.0 --port 8080`
     - on startup, the app runs `alembic upgrade head` against
       `SCOUT_DATABASE_URL`.
   - the Next.js standalone server (or skip if we serve the static export
     directly via FastAPI's `StaticFiles`).
4. **Data is NOT baked into the image.** The DB is in the sibling PG VM.
   `scripts/ingest_dc.py` is run separately against `SCOUT_DATABASE_URL`
   (typically once after the first deploy, then on data refresh).
5. Final image budget: **< 200 MB compressed**.

### Dockerfile.postgres

- `FROM postgis/postgis:16-3.4@sha256:<pin>` — pin by digest.
- Override `POSTGRES_USER`, `POSTGRES_DB` via env. Password injected via Fly
  secret at deploy time.
- Mount the Fly volume at `/var/lib/postgresql/data`.
- Expose port 5432 on the internal network only (no public listener on Fly).

### docker-compose.yml (local dev)

- `db` service:
  - `image: postgis/postgis:16-3.4`
  - Named volume `scout-pg-data` mounted at `/var/lib/postgresql/data`.
  - Healthcheck: `pg_isready -U scout`.
  - Exposes port 5432 to the compose network only (no host port unless the
    contributor passes `-p 5432:5432` themselves).
- `backend` service:
  - Depends on `db` (with `condition: service_healthy`).
  - Runs `uvicorn --reload` via the backend Dockerfile in dev mode.
  - `SCOUT_DATABASE_URL=postgresql+asyncpg://scout:scout@db:5432/scout`.
- `web` service:
  - Runs `pnpm dev` in `apps/web/`.
- Shared bind-mount for `./data/` so the host's source GeoJSONs are visible to
  the ingest script.
- A single command (`docker compose up`) brings the whole stack up locally.
- A second command (`docker compose run --rm backend python scripts/ingest_dc.py`)
  loads the data into the running PG.

### fly.app.toml (the app VM)

- `app = "scout"` (or your chosen Fly app name; if conflict, fall back to
  `scout-dc`).
- Single small VM (`shared-cpu-1x`, 512 MB RAM — measure during staging).
- Internal port 8080.
- `auto_stop_machines = "stop"`, `auto_start_machines = true`,
  `min_machines_running = 0` for the free tier.
- HTTP health check on `/api/health`. Health check must tolerate the cold-
  start window during which `alembic upgrade head` runs.
- Secrets (set via `flyctl secrets set`): `SCOUT_DATABASE_URL` (pointing to
  `scout-pg.internal:5432`), `SCOUT_ORS_API_KEY`, `SCOUT_NOMINATIM_USER_AGENT`.

### fly.postgres.toml (the sibling Postgres VM)

- `app = "scout-pg"`.
- Single VM (`shared-cpu-1x`, 512 MB RAM is enough for M1; bump later if
  needed). The free tier permits this.
- 3 GB Fly volume named `scout_pg_data`, mounted at `/var/lib/postgresql/data`.
- Internal-only (no `[[services]]` block exposing 5432 publicly). Reachable
  by the app via Fly's private 6PN network at `scout-pg.internal:5432`.
- Secrets: `POSTGRES_PASSWORD` (matches the app's `SCOUT_DATABASE_URL`).
- Healthcheck: `pg_isready` via Fly's `[checks]` mechanism.
- **No auto-stop** — DB must be available whenever the app wakes up.

### CI workflow (`ci.yml`)

On every PR:

- Set up Python (uv) + Node (pnpm).
- Cache uv and pnpm stores.
- Start a `postgis/postgis:16-3.4` **service container** so backend tests can
  hit a real PG (no SQLite-as-PG mocking — we want fidelity).
- Run `ruff check`, `mypy --strict`, backend `pytest` (with
  `SCOUT_DATABASE_URL` pointing at the service container).
- Run frontend `eslint`, Vitest, then Playwright + axe.
- Build the app Docker image (no push); cache layers.

### Deploy workflow (`deploy.yml`)

On push to `main`:

- Re-run CI.
- Build the app Docker image; tag with the commit SHA and `latest`.
- `flyctl deploy --config infra/fly.app.toml --image <tag>` using a
  `FLY_API_TOKEN` repo secret.
- App startup runs `alembic upgrade head` automatically, so schema changes
  ship with the app deploy.
- **The PG VM is NOT redeployed on app pushes.** It has its own
  `infra/fly.postgres.toml`; redeploys happen manually + rarely (e.g., for
  PostGIS version bumps), per `infra/runbooks/postgres-upgrade.md`.
- On failure, fail loud and don't roll the alias.

### First-deploy runbook (`infra/runbooks/first-deploy.md`)

Document the bootstrap sequence:

1. `flyctl apps create scout-pg`
2. `flyctl volumes create scout_pg_data --size 3 --app scout-pg`
3. `flyctl secrets set POSTGRES_PASSWORD=... --app scout-pg`
4. `flyctl deploy --config infra/fly.postgres.toml --app scout-pg`
5. Wait for PG to be healthy (`flyctl checks list --app scout-pg`).
6. `flyctl apps create scout`
7. `flyctl secrets set SCOUT_DATABASE_URL='postgresql+asyncpg://scout:...@scout-pg.internal:5432/scout' --app scout`
8. `flyctl secrets set SCOUT_ORS_API_KEY=... SCOUT_NOMINATIM_USER_AGENT='scout/0.1 (contact@...)' --app scout`
9. `flyctl deploy --config infra/fly.app.toml --app scout`  (this runs
   `alembic upgrade head`)
10. `flyctl ssh console --app scout -C 'python scripts/ingest_dc.py'` to load
    the DC features into PG.
11. `flyctl status --app scout` confirms healthy.

## Performance budgets to verify

- Cold-start (machine wake) → first 200 from `/api/health`: < 8 s.
- Image pull on cold deploy: < 30 s.
- Image size: < 200 MB.

## Don't

- Don't ship secrets in the image. Use Fly secrets for `SCOUT_ORS_API_KEY`,
  `SCOUT_DATABASE_URL`, etc.
- Don't include the source GeoJSONs in the final image (they're loaded into
  the DB by a separate command). Saves ~50 MB.
- Don't bake any DB data into the app image. The DB is the only source of
  truth for features.
- Don't expose the PG VM publicly on Fly. Internal-only via 6PN.
- Don't run Playwright in the deploy workflow (only in CI).
- Don't use `latest` tags for base images; pin by digest where reasonable.

## Deliverable

A working `infra/` and CI/CD that:

- Builds locally: `docker compose up` works.
- Deploys: `flyctl deploy` works after `flyctl secrets set …`.
- CI is green on a representative PR.

Commit message: `feat(infra): dockerize and deploy to Fly per PRD M1-F15`.
