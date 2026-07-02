# Scout

[Scout](https://scout-dc.com/) is an open source community webapp local to Washington DC intended to help disabled folks navigate the city with confidence. It's still in early active development. There's a lot to figure out! I'm a single maintainer. Contribution and feedback welcome!

I am using a lot of agentic development, partly due to my hand mobility problems that make voice-to-text much easier than typing. I've tried to make this repo friendly to practical and efficient agent development, and I share in the contribution guidelines a preferred LLM that is trained on energy grids that are largely powered by sustainable energy and value privacy. I've also used pi.dev + ollama + local small model evaluation somewhat heavily here to good effect.

## Prerequisites

- **Python ≥ 3.12** — [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- **Node ≥ 20 + pnpm** — needed once `apps/web/package.json` exists ([pnpm install](https://pnpm.io/installation)).
- **pre-commit** — `brew install pre-commit` or `uv tool install pre-commit` ([install guide](https://pre-commit.com/#install)).
- **go-pmtiles** - `brew install pmtiles`, used for working with (pmtiles archives)[https://github.com/protomaps/go-pmtiles]
- **uv** - `brew install uv`

### API Keys

Only **OpenRouteService** needs a real signup per se. Address searching uses
Washington, DC's public-domain Master Address Repository snapshot bundled with
Scout (`make ingest-dc-addresses`). Refuge Restrooms is keyless, and the
Protomaps basemap extract is built by a script. You can skip this entire section
if you only ever run `make docker-up` (the default boots a stack with routing,
geocoding, and restrooms stubbed — no outbound calls except whatever you enable).
The credential below is required for `make docker-up-realistic-run`, production
deploys, and manual verification against OpenRouteService.

Create your local env file first, then fill in the values below:

```bash
cp .env.example .env
```

1. **OpenRouteService** (`SCOUT_ORS_API_KEY`) — required for real routing.
   - Sign up at <https://openrouteservice.org/dev/#/signup>, confirm your
     email, sign in, and request a token from the dashboard. The free
     **Standard** plan is plenty for local dev (a few thousand directions
     requests/day, ~40 req/min).
   - Tokens can take a few minutes to activate after issuance.
   - Paste the token into `.env`:

     ```
     SCOUT_ORS_API_KEY=eyJ...your-token-here
     ```

   - The backend surfaces a clear "missing key" error on the first
     `/api/route` call if this is left blank.

2. **DC address snapshot load** (`make ingest-dc-addresses`) — no signup.
   After Postgres has the `dc_addresses` table (Alembic `0002+`), ingest the
   committed `data/dc_addresses.jsonl` into local or Compose-attached Postgres
   so `/api/geocode/*` serves real MAR rows (`DEC-023`). Compose does **not**
   auto-load MAR data yet; run this once whenever you recreate the DB volume.

3. **Refuge Restrooms** — no key, no signup. The default
   `SCOUT_REFUGE_BASE_URL` in `.env.example` is the public API
   (<https://www.refugerestrooms.org/api/v1>). Nothing further to do.

4. **Protomaps basemap tiles** — no key. Run `scripts/build_pmtiles.sh`
   once after cloning to populate `apps/web/public/tiles/dc.pmtiles` for
   the interactive MapLibre basemap (requires the `pmtiles` CLI from the
   prerequisites above).


## Getting started

```bash
git clone https://github.com/RSid/scout.git
cd scout
make bootstrap
pre-commit install
make sync
```

Run the full stack locally (PostGIS + backend + web) with Docker
Compose and stubs for map — no host account required:

```bash
make docker-up                       # http://localhost:3000  +  :8080
make docker-down
```

Once `.env` has the values above, boot the live stack:

```bash
make docker-up-realistic-run
```

See `infra/README.md` for the Compose layout (including **[Testing on a phone](infra/README.md#testing-on-a-phone)**) and `CONTRIBUTING.md` for the
end-to-end dev loop. `make help` lists every shortcut (lint, tests,
Compose, `make ingest` dry tally, `make ingest-write`, …). Copy `.env.example` to `.env` and adjust
`SCOUT_*` variables when you need host-side overrides.

## Deploy

First-time production setup (Hetzner VPS, Hostinger DNS, Docker Compose, host
Caddy for HTTPS) is documented step-by-step in
**[`infra/first-deploy.md`](infra/first-deploy.md)**.

### Subsequent deploys

After the first deploy, shipping a new version is a pull-and-rebuild on the
server. SSH in, then from the repo root (e.g. `/opt/scout`):

```bash
cd /opt/scout
git pull
docker compose --project-directory . -f infra/docker-compose.prod.yml up -d --build
```

What happens automatically:

- The app container rebuilds when source changed and restarts.
- **`alembic upgrade head`** runs on boot — schema migrations apply with the
  deploy; no manual migration step.

What you usually **do not** repeat:

- Data ingest (`ingest-features`, `ingest-addresses`) — only needed after
  recreating the database volume or when intentionally refreshing data. See
  [`infra/runbooks/refresh-dc-addresses.md`](infra/runbooks/refresh-dc-addresses.md).

Verify after each deploy:

```bash
curl -fsS https://yourdomain.com/api/health
docker compose --project-directory . -f infra/docker-compose.prod.yml ps
docker compose --project-directory . -f infra/docker-compose.prod.yml logs --tail=50 app
```

If the deploy fails, check app logs first; the container exits when uvicorn,
Next, or the in-image Caddy fails to start.

Once the stack is up, populate the `features` table from DC OpenData
(`scripts/ingest_dc.py`, M1-F11):

```bash
docker compose --project-directory . -f infra/docker-compose.yml \
    --profile ingest run --rm ingest
```

`make ingest` runs the same script in dry-run mode against your active
`SCOUT_DATABASE_URL` — useful for previewing counts before a real write.

### Connect with a GUI (Beekeeper Studio, TablePlus, DBeaver, …)

Once the stack is up (`make docker-up`), Postgres/PostGIS is exposed on your
machine. In your SQL client choose a **PostgreSQL** connection.

| Setting  | Typical value                                                                             |
| -------- | ----------------------------------------------------------------------------------------- |
| Host     | `127.0.0.1` or `localhost`                                                                |
| Port     | `5432` by default (`SCOUT_DB_HOST_PORT` in `.env` if you remapped it; see `.env.example`) |
| Database | `scout`                                                                                   |
| User     | `scout`                                                                                   |
| Password | `scout`                                                                                   |
| SSL      | Off                                                                                       |

In **Beekeeper Studio**: _New Connection_ → **PostgreSQL**, then paste the settings above (`Save` connects without SSL).

`db` and port `5432` inside Compose are only for containers on the Compose
network. From your laptop, use **localhost + the published host port** (the one
Docker maps into the VM), not hostname `db`. If connecting fails, confirm the
containers are healthy and adjust `SCOUT_DB_HOST_PORT` if another Postgres on
5432 conflicts.

### Alembic and `scripts/ingest_dc.py` from your laptop

Ingest (`make ingest-write` / `scripts/ingest_dc.py`) loads `.env` from your
current working directory (usually the repo root when using `make`). When
`SCOUT_DB_HOST_PORT` is set there, the script **rewrites** `SCOUT_DATABASE_URL`
if its hostname is `db`, `localhost`, or loopback so it connects to
`127.0.0.1:<SCOUT_DB_HOST_PORT>` with the same user, password, and database
name.

`alembic` / `make migrate` applies the same rewrite from **process environment
variables** only: `SCOUT_DATABASE_URL` and `SCOUT_DB_HOST_PORT` must be
exported (or your shell must `source` `.env`) before `make migrate` so Alembic
sees them.

## Reporting issues

Use the GitHub Issues tab. You'll see two structured templates:

- **Bug report** — something in Scout itself isn't working.
- **Data is wrong about a place** — a feature is mis-described in the
  underlying DC dataset. (Scout surfaces public data; the city owns the
  source-of-record. An in-app correction flow lands with `M3-F25`.)

**Security vulnerabilities** do not go in public issues — open a private
security advisory on this repo's **Security** tab instead. See
`CONTRIBUTING.md` and `SECURITY.md` for the full disclosure process.
Washington, DC accessibility navigation — monorepo layout per PRD §8 (`docs/02-prd.md`): `apps/`, `data/`, `scripts/`, `infra/`, `docs/`.
