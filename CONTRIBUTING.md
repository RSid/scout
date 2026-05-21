# Contributing to Scout

Thanks for being here. Scout is an open-source accessibility navigation tool
for Washington, DC. Contributions of any size — code, design, docs, data, or
domain expertise — are welcome.

> **Status (May 2026):** Scout is pre-MVP. The M1 scaffold (FastAPI backend,
> Next.js frontend, data ingestion, Dockerization) is in progress; some
> commands below assume that scaffold has landed. If something isn't on disk
> yet, see `docs/prompts/` for the current scaffolding tasks.

## Start here

1. Skim `docs/01-one-pager.md` (what Scout is) and `docs/02-prd.md`
   (what's being built).
2. Read `AGENTS.md` for coding conventions — both the root one and the
   nested one for the subtree you'll touch (`apps/backend/`, `apps/web/`,
   `scripts/`).
3. Browse `docs/03-decisions.md` if you want to understand _why_ a choice
   was made before proposing a change to it.
4. Pick an issue tagged `good first issue` or `help wanted`, or propose
   something in Discussions.

## Ground rules

### License: AGPL-3.0

By contributing, you agree your contributions will be released under
[AGPL-3.0](LICENSE). Practically: anyone who deploys Scout (publicly or as
a hosted service) must also publish the source code, including their
modifications. This is intentional — Scout is a civic-good project and we
want it to stay open.

### Code of Conduct

This project follows the [Contributor Covenant
v2.1](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
Be kind and constructive — especially when discussing disability,
accessibility, or the experiences of disabled users. Disagreement is fine;
contempt is not.

### Accessibility is non-negotiable

Scout exists for people who are routinely failed by mainstream mapping
apps. Accessibility regressions block release. WCAG 2.2 AA is the floor
(`NF-A11Y-*` in the PRD); axe-core runs in CI.

## Development setup

### Prerequisites

- **Python ≥ 3.12** with [`uv`](https://github.com/astral-sh/uv).
- **Node ≥ 20** with `pnpm` (for the frontend, once it scaffolds).
- **Docker** with Compose (for local Postgres + PostGIS, once `M1-F15`
  lands).
- **`pre-commit`** for the lint/format hooks (`brew install pre-commit` or
  `uv tool install pre-commit`).

### First-time setup

```bash
git clone https://github.com/RSid/scout.git
cd scout
pre-commit install
make bootstrap
make sync                  # installs apps/backend deps via uv
cp .env.example .env       # then edit SCOUT_* for your machine
```

Run `make help` for the full shortcut list (lint, typecheck, Compose,
ingest dry-run, etc.).

### Running locally

Until `infra/docker-compose.yml` lands (`M1-T05`), `make dev` stops with a
pointer to that ticket. Once Compose is in place, use:

```bash
make dev
# or: make docker-up
```

That will bring up Postgres + PostGIS, the FastAPI backend, and the Next.js
frontend once those services are wired in `M1-F15`; applies Alembic
migrations; and (optionally) runs the DC data ingest on first boot.
Source GeoJSON inputs live under `data/` (`PRD §8`).

There is intentionally no stub `fastapi dev main.py` entrypoint —
`apps/backend/` is scaffolded in `M1-T01`.

### Running tests

```bash
make test
```

Behind the scenes this runs backend `pytest` when `apps/backend/tests/` exists,
and frontend `pnpm test` when `apps/web/package.json` lands. Frontend E2E:

```bash
cd apps/web && pnpm exec playwright test
```

Coverage floors and the full testing philosophy live in `AGENTS.md`.

## Submitting a change

1. **Open or claim an issue.** Even small changes benefit from a recorded
   _why_.
2. **Branch.** Use a descriptive name that references the ticket id when
   one exists: `feat/m1-f04-route-caching`, `fix/m1-f06-focus-trap`,
   `docs/contributing-clarification`.
3. **Make the change.** Follow `AGENTS.md` for conventions. Keep PRs
   scoped to one concern. We love humans coding, but if you're using agents we support [GreenPT](https://greenpt.com/) for sustainability and privacy-focused LLMs!
4. **Test it.** New behavior gets a new test. A red CI isn't a reviewer's
   problem.
5. **Push and open a PR** using the description template below. Fill in
   tickets, decisions touched, mocks introduced, and screenshots if UI.
6. **Address review.** Be open to changes; explain pushback with evidence.
7. **Squash and merge.** A clean history is part of the deliverable.

### Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <subject>     # ≤ 72 chars

[optional body]
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`,
`build`. Examples:

```
feat(backend): add /api/route caching (M1-F04)
fix(web): keep focus inside profile panel (M1-F06)
docs: clarify AGENTS.md commit format
```

### PR description template

```
## Summary
<what changed, in 1–3 sentences>

## Tickets closed
- M1-F04
- OQ-10 (now RESOLVED — note in docs/02-prd.md §10)

## Decisions touched
- DEC-020 (extended adapter for new vendor)

## Tests added or changed
- ...

## Mocks introduced
- ...

## Screenshots
<UI changes only>

## Out of scope
- ...
```

The full agent-facing rules around mocks, ticket citation, and
decision-log hygiene live in `AGENTS.md` under _Working with this repo as
an agent_.

### What CI checks

- Lint + format: `ruff` (Python), `eslint` + `prettier` (TS).
- Type checks: `mypy --strict` (Python), `tsc --noEmit` (TS).
- Unit tests: `pytest`, `vitest`.
- E2E: Playwright.
- Accessibility: `jest-axe` (unit) and `@axe-core/playwright` (E2E) —
  zero AA violations.
- Coverage floors (see `AGENTS.md`).
- Dependency vulnerability scan: `pip-audit`, `npm audit --omit=dev` —
  fail on `high`/`critical`.

Until the CI workflow lands (`M1-F15`), please run the local equivalents
before pushing.

## Reporting bugs and data issues

### Bugs in Scout itself

Open an issue with:

- **What you did** (steps to reproduce)
- **What you expected**
- **What happened**
- **Environment** (browser + OS, or `python -V` for backend bugs)
- **Screenshots / logs**, scrubbed of any PII

### "Data is wrong about a place"

DC's underlying datasets are often years old; Scout doesn't fix the data,
it surfaces freshness. When the M3 user-corrections flow ships (`M3-F25`),
you'll be able to report inside the app. Until then, please open an issue.

### Security issues

**Do not file a public issue.** Open a private security advisory on this
repo's _Security_ tab. Please give us a reasonable window to fix before
disclosure. Scout has no bug-bounty budget but we will credit you in the
release notes.

## Questions

- **General discussion:** open a GitHub Discussion.
- **Sensitive accessibility feedback** you'd rather not share publicly:
  email the maintainer listed in the repo profile.

Thanks for caring about this work.
