# Prompt: Dockerize Scout and deploy (host-neutral)

## Role

You are a senior DevOps engineer. You package Scout into a single, small Docker
image that runs unchanged on any host, and you wire up CI. You do **not** marry
Scout to a specific provider — provider choice is a deployment-time decision
(`DEC-025`).

## Inputs (read these before coding)

- `docs/02-prd.md` §6.1 ticket M1-F15 and §7.2 (Performance).
- `docs/03-decisions.md` **DEC-025 (host-neutral deploy — read first)**,
  DEC-006 (superseded, retained as history), DEC-011, DEC-016, DEC-017, and
  **DEC-019 (sibling Postgres topology)**.
- `docs/proposals/green-hosting-shortlist.md` — the green-host evaluation, for
  when a concrete provider is chosen.
- `infra/runbooks/first-deploy.md` — the host-neutral bootstrap procedure and
  the full environment contract.

## The contract (what "host-neutral" means)

Scout deploys to **any host that can run an OCI/Docker image and reach a
PostgreSQL 16 + PostGIS database.** That is the entire requirement. Concretely:

- **One public port.** The runtime image bundles a Caddy reverse proxy
  (`infra/Caddyfile`) that listens on `$PORT` and routes `/api/*` to the backend
  and everything else to the Next.js server. No host-provided proxy is needed.
- **One DB URL.** The database is reached only via `SCOUT_DATABASE_URL`.
- **Env-injected secrets.** Nothing host-specific is committed.
- **Migrations on boot.** The container runs `alembic upgrade head` at startup.

## What to build

```
infra/
├── Dockerfile                 # multi-stage; runtime = Caddy + API + Next + tiles
├── Dockerfile.postgres        # PG image: pins postgis/postgis:16-3.4 by digest
├── Caddyfile                  # in-image proxy: /api/* -> :8081, /* -> :3000
├── start.sh                   # entrypoint: alembic, uvicorn, Next, Caddy
├── docker-compose.yml         # local dev: db + backend + web
├── docker-compose.prod.yml    # host-neutral prod: app + db (+ ingest profile)
├── runbooks/
│   └── first-deploy.md        # provider-agnostic bootstrap + env contract
├── .dockerignore
└── README.md

.github/workflows/
├── ci.yml                     # PR checks: tests, lint, axe, build image (no push)
└── deploy.yml                 # push to main → build + push image; deploy step
                               # is a thin, provider-specific call (see appendix)
```

### Dockerfile (app, multi-stage)

1. **`deps-backend`** (Python+uv): installs backend deps into `/app/.venv`.
2. **`builder-web`** (Node): installs frontend deps, builds the Next.js
   **standalone** bundle. Build with a **relative** API base URL (leave
   `NEXT_PUBLIC_SCOUT_API_BASE_URL` empty) so the browser calls `/api/*` on the
   same origin Caddy serves.
3. **`builder-tiles`**: runs `scripts/build_pmtiles.sh` → `dc.pmtiles`.
4. **`caddy-bin`**: sources the Caddy static binary from the official image.
5. **`runtime`** (Python slim): copies the venv, API code, Alembic migrations,
   the Next standalone bundle, the PMTiles file, the Caddy binary, and the
   Caddyfile. `ENTRYPOINT` is `start.sh`, which runs `alembic upgrade head`,
   then uvicorn (loopback `:8081`), Next (loopback `:3000`), and Caddy (`$PORT`).
6. **Data is NOT baked into the image.** It is loaded into the DB by the ingest
   scripts (see the runbook). Final image budget: **< 200 MB compressed**.

### docker-compose.prod.yml (single-host baseline)

- `db`: `postgis/postgis` with a named volume; password from `SCOUT_DB_PASSWORD`;
  internal-only (no published port).
- `app`: the `runtime` image; publishes `${SCOUT_HTTP_PORT:-8080}:8080`; env per
  the contract; `SCOUT_DATABASE_URL` points at `db:5432`.
- `ingest-features` / `ingest-addresses`: profile-gated one-off services for
  first-deploy data loading.

### CI workflow (`ci.yml`) — unchanged in spirit

On every PR: set up Python (uv) + Node; cache stores; start a
`postgis/postgis:16-3.4` **service container**; run `ruff`, `mypy --strict`,
backend `pytest`; run frontend `eslint`, Vitest, Playwright + axe; build the app
image (no push). This is provider-independent.

### Deploy workflow (`deploy.yml`)

On push to `main`: re-run CI, build the image, tag with the commit SHA + push to
a registry. **The actual "go live" step is one provider-specific command** — keep
it isolated at the end of the job so swapping hosts is a few lines, not a
rewrite. Store whatever credential the chosen host needs as a GHA secret.

## Performance budgets to verify

- Cold-start (container boot) → first 200 from `/api/health`: < 8 s.
- Image size: < 200 MB compressed.

## Don't

- Don't hardcode a provider name, hostname, or CLI into application code or the
  image. Provider specifics live in the appendix + the chosen host's runbook.
- Don't ship secrets in the image. Use the host's secret store.
- Don't bake DB data or source GeoJSONs into the runtime image.
- Don't expose the database publicly.
- Don't use `latest` tags for base images; pin by digest where reasonable.

## Deliverable

A working `infra/` + CI that:

- Builds locally: `docker compose up` (dev) and `docker build -f infra/Dockerfile .`
  (prod) both work.
- Runs host-neutral: `docker compose -f infra/docker-compose.prod.yml up`
  serves `/` and `/api/health` on a single port.
- CI is green on a representative PR.

Commit message: `feat(infra): host-neutral dockerize + deploy per PRD M1-F15 (DEC-025)`.

---

## Appendix — per-provider deploy notes

Pick one when ready; see `docs/proposals/green-hosting-shortlist.md` for the
trade-offs and the required Third-party TOS review (AGENTS.md rule #12). Each is
a thin mapping of the same image + env contract.

### Single VPS (any Linux box with Docker)

- `git clone` the repo, set `.env`, `docker compose -f infra/docker-compose.prod.yml up -d --build`.
- Front with a TLS terminator (Cloudflare proxy, or an outer Caddy/nginx).
- Deploy = pull + `up -d`. CI can `ssh` and run that.

### Google Cloud — Cloud Run + Cloud SQL (GWF-verified green)

- Push the image to Artifact Registry; deploy to Cloud Run (it injects `$PORT`
  and terminates TLS). Cloud Run runs the single container as-is.
- Provision Cloud SQL for PostgreSQL, enable PostGIS, set `SCOUT_DATABASE_URL`
  (via the Cloud SQL connector or a private IP).
- Deploy step: `gcloud run deploy`.

### Render / Railway (easiest; not GWF-verified)

- Connect the repo or push the image; the platform builds the Dockerfile and
  injects `$PORT`. Add a managed Postgres and `CREATE EXTENSION postgis`.
- Set env from the contract; deploy is automatic on push (or `render deploy`).

### Hetzner (GWF-verified green, EU regions)

- Same as the VPS path, on a Hetzner Cloud server in an EU (hydropower) region;
  accept the transatlantic latency for the DC audience.
