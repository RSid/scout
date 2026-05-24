# Scout

Scout is an open source community webapp local to Washington DC intended to help disabled folks navigate GPS map routing. It's still in early active development, and not hosted. There's a lot to figure out! I'm a single maintainer. I am using a lot of agentic development, partly due to my hand mobility problems that make voice-to-text much easier than typing. I've tried to make this repo friendly to practical and efficient agent development, and share in the contribution guidelines preferred LLMs that are trained on energy grids that are largely powered by sustainable energy and value privacy. Contribution and feedback will be welcome once I have reached milestone 1 and deployed!

## Prerequisites

- **Python ≥ 3.12** — [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- **Node ≥ 20 + pnpm** — needed once `apps/web/package.json` exists ([pnpm install](https://pnpm.io/installation)).
- **pre-commit** — `brew install pre-commit` or `uv tool install pre-commit` ([install guide](https://pre-commit.com/#install)).
- **go-pmtiles** - `brew install pmtiles`, used for working with (pmtiles archives)[https://github.com/protomaps/go-pmtiles]

### API Keys

Only **OpenRouteService** needs a real signup. Photon (geocoding) and
Refuge Restrooms are keyless, and the Protomaps basemap extract is built
by a script. You can skip this entire section if you only ever run
`make docker-up` (the default boots a stack with every third-party adapter
stubbed — no outbound calls). The credentials below are required for
`make docker-up-realistic-run`, production deploys, and manual verification
against live providers.

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

2. **Photon geocoding** (`SCOUT_PHOTON_USER_AGENT`) — no key. Scout's
   backend talks to Photon (Komoot's open-source OSM-backed geocoder) for
   address autocomplete; the browser never calls a geocoder directly
   (`DEC-022`). The default upstream is Komoot's community endpoint at
   `https://photon.komoot.io`, which is "fair use" only.
   - Set a descriptive `User-Agent` in `.env` so upstream operators can
     reach you before any block:

     ```
     SCOUT_PHOTON_USER_AGENT=scout-dev/0.1 (you@example.com)
     ```

   - To point at a self-hosted Photon (e.g. once the `DEC-022` follow-up
     PR adds the Fly machine), override `SCOUT_PHOTON_BASE_URL`. No app
     code change required.

3. **Refuge Restrooms** — no key, no signup. The default
   `SCOUT_REFUGE_BASE_URL` in `.env.example` is the public API
   (<https://www.refugerestrooms.org/api/v1>). Nothing further to do.

4. **Protomaps basemap tiles** — no key. Run `scripts/build_pmtiles.sh`
   once after cloning to populate `apps/web/public/tiles/dc.pmtiles` for
   the interactive MapLibre basemap (requires the `pmtiles` CLI from the
   prerequisites above).

Once `.env` has the values above, boot the live stack:

```bash
make docker-up-realistic-run
```

## Getting started

```bash
git clone https://github.com/RSid/scout.git
cd scout
make bootstrap
pre-commit install
make sync
```

Run the full stack locally (PostGIS + backend + web) with Docker
Compose — no host account required:

```bash
make docker-up                       # http://localhost:3000  +  :8080
make docker-down
```

See `infra/README.md` for the Compose layout and `CONTRIBUTING.md` for the
end-to-end dev loop. `make help` lists every shortcut (lint, tests,
Compose, ingest dry-run, …). Copy `.env.example` to `.env` and adjust
`SCOUT_*` variables when you need host-side overrides.

## Reporting issues

Use the GitHub Issues tab. You'll see two structured templates:

- **Bug report** — something in Scout itself isn't working.
- **Data is wrong about a place** — a feature is mis-described in the
  underlying DC dataset. (Scout surfaces public data; the city owns the
  source-of-record. An in-app correction flow lands with `M3-F25`.)

**Security vulnerabilities** do not go in public issues — open a private
security advisory on this repo's **Security** tab instead. See
`CONTRIBUTING.md` for the full process; `SECURITY.md` lands with `M1-T09`.
Washington, DC accessibility navigation — monorepo layout per PRD §8 (`docs/02-prd.md`): `apps/`, `data/`, `scripts/`, `infra/`, `docs/`.
