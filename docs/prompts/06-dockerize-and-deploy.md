# Prompt: Dockerize Scout and deploy to Fly.io

## Role

You are a senior DevOps engineer. You package Scout into a single, small Docker
image and configure Fly.io deployment + CI.

## Inputs (read these before coding)

- `docs/02-prd.md` §6.1 ticket M1-F15 and §7.2 (Performance).
- `docs/03-decisions.md` DEC-006, DEC-011, DEC-016, DEC-017.

## What to build

```
infra/
├── Dockerfile                 # multi-stage; single final image
├── docker-compose.yml         # local dev: hot-reload backend + frontend
├── fly.toml                   # Fly.io app config
├── .dockerignore
└── README.md                  # how to build, run, deploy

.github/workflows/
├── ci.yml                     # PR checks: tests, lint, axe
└── deploy.yml                 # push to main → Fly deploy
```

## Required behaviors

### Dockerfile (multi-stage)

1. **`builder-web`** (Node): installs frontend deps, runs `pnpm build`,
   outputs `apps/web/.next/standalone` + `static` + `public`.
2. **`builder-tiles`**: runs `scripts/build_pmtiles.sh` (which uses
   `tippecanoe` or fetches a pre-built DC PMTiles from Protomaps).
3. **`builder-data`** (Python): runs `uv run python scripts/ingest_dc.py
   --output /out/features.parquet`.
4. **`runtime`** (Python slim): copies the API code, the built Next.js
   standalone bundle, the PMTiles file, and the features.parquet. Runs a
   small process supervisor (`honcho` or `s6-overlay`) that starts:
   - `uvicorn scout.main:app --host 0.0.0.0 --port 8080`
   - the Next.js standalone server (or skip if we serve the static export
     directly via FastAPI's `StaticFiles`).
5. Final image budget: **< 200 MB compressed**.

### docker-compose.yml

- `backend` service with `--reload` for hot reload.
- `web` service with `pnpm dev`.
- Shared volume for the `data/` directory.
- A single command (`docker compose up`) brings the whole stack up locally.

### fly.toml

- `app = "scout"` (or your chosen Fly app name; if conflict, fall back to
  `scout-dc`).
- Single small VM (`shared-cpu-1x`, 256 MB or 512 MB RAM — measure during
  staging).
- Internal port 8080.
- `auto_stop_machines = "stop"`, `auto_start_machines = true`,
  `min_machines_running = 0` for the free tier.
- HTTP health check on `/api/health`.

### CI workflow (`ci.yml`)

On every PR:

- Set up Python (uv) + Node (pnpm).
- Cache uv and pnpm stores.
- Run `ruff check`, `mypy --strict`, backend `pytest`.
- Run frontend `eslint`, Vitest, then Playwright + axe.
- Build the Docker image (no push); cache layers.

### Deploy workflow (`deploy.yml`)

On push to `main`:

- Re-run CI.
- Build the Docker image; tag with the commit SHA and `latest`.
- `flyctl deploy --image <tag>` using a `FLY_API_TOKEN` repo secret.
- On failure, fail loud and don't roll the alias.

## Performance budgets to verify

- Cold-start (machine wake) → first 200 from `/api/health`: < 8 s.
- Image pull on cold deploy: < 30 s.
- Image size: < 200 MB.

## Don't

- Don't ship secrets in the image. Use Fly secrets for `SCOUT_ORS_API_KEY` etc.
- Don't include the source GeoJSONs in the final image (only the derived
  parquet — saves ~50 MB).
- Don't run Playwright in the deploy workflow (only in CI).
- Don't use `latest` tags for base images; pin by digest where reasonable.

## Deliverable

A working `infra/` and CI/CD that:

- Builds locally: `docker compose up` works.
- Deploys: `flyctl deploy` works after `flyctl secrets set …`.
- CI is green on a representative PR.

Commit message: `feat(infra): dockerize and deploy to Fly per PRD M1-F15`.
