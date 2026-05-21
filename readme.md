# Scout

## Prerequisites

- **Python ≥ 3.12** — [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- **Node ≥ 20 + pnpm** — needed once `apps/web/package.json` exists ([pnpm install](https://pnpm.io/installation)).
- **pre-commit** — `brew install pre-commit` or `uv tool install pre-commit` ([install guide](https://pre-commit.com/#install)).

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
