# Scout

Washington, DC accessibility navigation — monorepo layout per PRD §8 (`docs/02-prd.md`): `apps/`, `data/`, `scripts/`, `infra/`, `docs/`.

## Prerequisites

- **Python ≥ 3.12** — [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- **Node ≥ 20 + pnpm** — needed once `apps/web/package.json` exists ([pnpm install](https://pnpm.io/installation)).

## Getting started

```bash
git clone https://github.com/RSid/scout.git
cd scout
make bootstrap
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
