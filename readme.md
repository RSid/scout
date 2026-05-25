# Scout

Scout is an open source community webapp local to Washington DC intended to help disabled folks navigate GPS map routing. It's still in early active development, and not hosted. There's a lot to figure out! I'm a single maintainer. I am using a lot of agentic development, partly due to my hand mobility problems that make voice-to-text much easier than typing. I've tried to make this repo friendly to practical and efficient agent development, and share in the contribution guidelines preferred LLMs that are trained on energy grids that are largely powered by sustainable energy and value privacy. Contribution and feedback will be welcome once I have reached milestone 1 and deployed!

## Prerequisites

- **Python ≥ 3.12** — [`uv`](https://docs.astral.sh/uv/getting-started/installation/)
- **Node ≥ 20 + pnpm** — needed once `apps/web/package.json` exists ([pnpm install](https://pnpm.io/installation)).
- **pre-commit** — `brew install pre-commit` or `uv tool install pre-commit` ([install guide](https://pre-commit.com/#install)).
- **go-pmtiles** - `brew install pmtiles`, used for working with (pmtiles archives)[https://github.com/protomaps/go-pmtiles]

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

### Connect with a GUI (Beekeeper Studio, TablePlus, DBeaver, …)

Once the stack is up (`make docker-up`), Postgres/PostGIS is exposed on your
machine. In your SQL client choose a **PostgreSQL** connection.

| Setting | Typical value |
| --- | --- |
| Host | `127.0.0.1` or `localhost` |
| Port | `5432` by default (`SCOUT_DB_HOST_PORT` in `.env` if you remapped it; see `.env.example`) |
| Database | `scout` |
| User | `scout` |
| Password | `scout` |
| SSL | Off |

In **Beekeeper Studio**: *New Connection* → **PostgreSQL**, then paste the settings above (`Save` connects without SSL).

`db` and port `5432` inside Compose are only for containers on the Compose
network. From your laptop, use **localhost + the published host port** (the one
Docker maps into the VM), not hostname `db`. If connecting fails, confirm the
containers are healthy and adjust `SCOUT_DB_HOST_PORT` if another Postgres on
5432 conflicts.
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
