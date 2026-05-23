# AGENTS.md

Authoritative coding conventions for the Scout monorepo. **Every coding agent
must read this file before making changes.** This is the cross-cutting layer;
per-stack rules live in nested `AGENTS.md` files (closest one wins per the
[agents.md](https://agents.md) spec).

## Sources of truth

Before writing code, also read:

- `docs/01-one-pager.md` — what Scout is, who it's for, voice and tone.
- `docs/02-prd.md` — *what* to build (feature tickets `M{n}-F{nn}`, NFRs,
  data model).
- `docs/03-decisions.md` — *why* (ADRs `DEC-NNN`). Treat as binding.
- `docs/appendix-data-schema.md` — Feature schema and ingestion rules.
- `docs/prompts/*` — per-task seed prompts; `prompts/README.md` lists
  conventions every downstream agent must follow.

Per-stack details:

- `apps/backend/AGENTS.md` — Python, FastAPI, SQLAlchemy, Pydantic
- `apps/web/AGENTS.md` — TypeScript, React, Next.js, Tailwind
- `scripts/AGENTS.md` — data-ingestion and dev-utility scripts

## Core principles

In priority order. When two collide, the higher one wins.

1. **Practicality, human readability, simplicity above all.** Clever code is a
   future tax. A new contributor should be able to read and modify any module
   in this repo without a guided tour.
2. **Follow existing conventions.** When this repo has a pattern, use it. When
   it doesn't, use the established industry pattern. Don't invent a third
   option without a written reason.
3. **Self-document through naming.** A reader should understand the *what*
   from class, function, and variable names. When a comment is needed, explain
   the *why*, not the *what*. Python comments follow standard docstring
   conventions ([PEP 257](https://peps.python.org/pep-0257/)).
4. **Pure functions, no side effects** wherever it's natural. Side effects
   collect at the edges (HTTP handlers, DB writes, file I/O, logging).
5. **Explicit dependency injection.** Pass dependencies in; don't reach for
   module-level globals. The framework's DI hooks (FastAPI's `Depends`, React
   Context) are the seams.
6. **Strong typing.** Pydantic v2 at every Python boundary; TypeScript strict
   on the frontend. No `Any` / `any` without a comment justifying it.
7. **REST for API contracts.** OpenAPI is auto-generated from FastAPI. No
   GraphQL, no RPC, no WebSocket in M1.
8. **Be paranoid about being publicly deployed.** Rate limits, secure headers,
   secret hygiene, dependency scanning, and PII-safe logging are not optional
   even when the audience is small.

## Working with this repo as an agent (non-negotiable)

These rules exist to prevent the failure modes that come up most often when
AI agents work in this repo. They override comfort or speed.

1. **A change is not "done" until tests pass.** If unit, integration, or E2E
   tests fail, the work is incomplete. State so explicitly; do not declare
   success.
2. **Never delete or weaken a passing test** to make new code pass. If a test
   seems wrong, raise it in the PR; don't quietly remove it.
3. **Mocks must be visible.** When you mock something, add a one-line comment
   `# MOCK: <what and why>` (Python) or `// MOCK: <what and why>` (TS) at
   the mock site, AND list every mock in the PR description under a "Mocks
   introduced" heading. The reviewer will check them.
4. **Don't reverse a `DEC-NNN` silently.** If a decision should change, open
   `docs/proposals/DEC-NNN-followup.md` with the rationale and stop. Wait for
   owner sign-off before implementing.
5. **Cite ticket IDs.** Commits and PR titles reference the `M{n}-F{nn}` they
   implement (or `chore:` / `docs:` if no ticket applies). This keeps the
   traceability the PRD relies on.
6. **Update `docs/02-prd.md` §10 when you close an `OQ-NN`.** Mark it
   RESOLVED with a one-line pointer to the PR or commit.
7. **No new dependencies without justification.** Each new dependency gets one
   sentence in the PR description: what need, what was rejected, why this.
   Prefer the standard library and existing deps.
8. **Don't invent APIs, libraries, or types.** If you reference a function,
   class, env var, or package, it must already exist in the codebase or be a
   confirmed dependency. No improvising signatures.
9. **Ask before reasoning past ambiguity.** If a spec is unclear, surface the
   question rather than guessing. One question costs less than one iteration.
10. **Be candid with reviewers.** Don't validate an idea you don't agree with
    or assert "you're absolutely right" without evidence — push back with
    facts when warranted.
11. **Prefer registered scripts over ad-hoc CLI invocations.** Recurring
    operations (querying GitHub issues, ingesting data, generating fixtures)
    are checked into `scripts/`. Consult the *Tool registry* in
    `scripts/AGENTS.md` before reconstructing a `gh` / `fly` / `docker`
    call by hand. If a recurring operation is missing, add a script and a
    registry row in the same PR.

## Repo layout

See `docs/02-prd.md` §8 for the full diagram. The shape:

```
scout/
├── apps/
│   ├── backend/         FastAPI app — apps/backend/AGENTS.md
│   └── web/             Next.js app — apps/web/AGENTS.md
├── data/                Source GeoJSONs (read-only inputs)
├── scripts/             Ingestion and dev utilities — scripts/AGENTS.md
├── infra/               Dockerfiles, fly.toml, GH workflows, runbooks
├── docs/                PRD, decisions, prompts, schema
├── AGENTS.md            This file
└── README.md
```

## Commits and PRs

- **Conventional Commits.** `type(scope): subject` (≤ 72 chars). Types:
  `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`, `ci`, `build`.
  Examples: `feat(backend): add /api/route caching (M1-F04)`,
  `fix(web): focus trap loop in profile panel (M1-F06)`.
- **Branches for automation.** Prefer `{type}/{ticket-id}-{slug}`
  (`feat/m1-f04-route-cache`): local helpers derive ticket/decision IDs from the
  **branch name** via `scripts/new-issue.sh`, `scripts/gh-pr.sh`, and the
  `prepare-commit-msg` hook documented in `scripts/AGENTS.md` (configure with
  `pre-commit install` — it now installs both `commit` **and**
  `prepare-commit-msg`; add `-t prepare-commit-msg` explicitly if hooks were
  installed before those stages existed).
- **One PR, one concern.** A scaffold PR doesn't also refactor unrelated
  modules. Found an unrelated bug? File an issue or open a separate PR.
- **PR description template:**
  - Summary
  - Tickets closed (`M1-F04`, `OQ-10`, …)
  - Decisions touched (`DEC-NNN`)
  - Tests added or changed
  - Mocks introduced
  - Screenshots (if UI)
  - Out of scope
- **Branch protection on `main`** (DEC-017): green CI + 1 review for outside
  contributors; solo-dev self-merge allowed per the documented exception.

## Testing philosophy

Testing pyramid: unit tests at the base, integration in the middle, E2E at
the top.

- **One behavior per test.** Each `test_<…>` exercises one thing. When the
  same logic needs many inputs, use parameterization
  (`@pytest.mark.parametrize` / `test.each`), not loops or copy-pasted tests.
- **Prefer a single assertion statement per test.** Asserting multiple
  invariants of the *same* behavior in one test is fine; testing a *second*
  behavior is a new test.
- **Be intentional with mocks.** Default to real code paths and small, owned
  test doubles (the `stub` adapters from DEC-020). Reach for `unittest.mock`
  / `vi.mock` only when isolating a true external boundary (HTTP, time,
  randomness, filesystem). Every mock obeys rule #3 in *Working with this
  repo as an agent*.
- **No order-dependent tests.** `pytest-randomly` is enabled (DEC-012);
  tests must pass in any order.
- **Coverage floors** (DEC-012): 70% line on `apps/backend/scout/`; 80% on
  `apps/web/components/` and `apps/web/lib/`. Floors are a guardrail, not a
  target — aim for the coverage that catches regressions, not a number.
- **Accessibility is gated by tests.** `jest-axe` in unit, `@axe-core/playwright`
  in E2E. Zero WCAG 2.2 AA violations.

## Dependency policy

- New dependencies require the one-sentence PR justification above.
- Pin top-level versions: `pyproject.toml` uses `>=X.Y.Z` minimums;
  `package.json` uses exact versions or `~` for patch-only. The lockfile is
  the source of truth.
- CI runs vulnerability scanning (`pip-audit` for Python, `npm audit
  --omit=dev` for Node) and fails on `high` / `critical` advisories.
- Dependabot PRs that fail tests get fixed, not merged with overrides.

## Security and privacy posture (publicly deployed)

This is a public app handling routing data for disabled users. The bar is
higher than a hobby project. The PRD's `NF-PRIV-*` and `NF-TRUST-*` sections
are binding; this section is the *code-level* expression of them. Library
choices are left to the implementing agent; the principles are not.

- **Rate-limit anything reachable from the public internet.** Per-IP limits
  on every `POST` and on `GET` endpoints that fan out to expensive work.
  Limits are per-endpoint: `/api/health` is cheap, `/api/route-features`
  needs a tighter cap.
- **Security headers on every response.** Strict `Content-Security-Policy`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`,
  `Permissions-Policy` denying camera/microphone/geolocation by default,
  `Strict-Transport-Security` once HTTPS is fronted. Add an allow-list entry
  only with a comment explaining why.
- **CORS is closed by default** (PRD M1-F12). Opt-in per env var for dev.
- **Secrets never leave the env.** Configuration via `pydantic-settings` from
  env vars; nothing committed. Local dev uses `.env` (gitignored). Production
  uses Fly secrets. Add `gitleaks` (or equivalent) to pre-commit when
  scaffolding.
- **PII-safe logs.** Never log API keys, full request bodies, raw form
  values, user-entered addresses, email addresses, IP addresses (after the
  7-day retention per `NF-PRIV-04`), session tokens, or raw geolocation. *Do*
  log request id, route, status, duration, error code, feature counts, cache
  hit/miss. When in doubt, scrub.
- **Input validation at the boundary.** Pydantic on inbound JSON; explicit
  allow-lists for enum-like query params; reject anything you don't
  understand with HTTP 400 — never silently coerce.
- **No third-party scripts in M1** (`NF-PRIV-01`). No analytics, no fonts
  from a CDN, no embedded widgets. Even harmless-looking ones (Google Fonts,
  gtag, Hotjar) leak IPs.
- **L7 DDoS / WAF** is principally handled by whatever sits in front of Fly
  (Cloudflare or equivalent) once we have a hostname. The app's job is per-IP
  rate limits, cheap health checks, and capping any unbounded query (e.g.
  the 500-feature cap in `/api/route-features`).

## Accessibility (cross-cutting)

The full spec is PRD §7.1 (`NF-A11Y-*`). Code-level rules:

- Color is never the sole signal — pair every color cue with shape, icon, or
  label.
- Focus must be visible everywhere, minimum 3:1 contrast on the indicator.
- `prefers-reduced-motion` and `prefers-color-scheme` honored throughout.
- Keyboard parity for every mouse and touch action.
- Use `@react-aria/` or Radix primitives for Dialog, Combobox, Popover,
  Menu, Tabs — do not hand-roll focus management.
- Every map-conveyed datum has a non-map textual equivalent (the
  `<FeatureListView/>`).
- Each PR runs axe in CI.

## Documentation hygiene

- If a change makes the PRD wrong, fix the PRD in the same PR.
- If a change touches the data schema, update
  `docs/appendix-data-schema.md` and add an Alembic migration in the same PR.
- If a change closes an `OQ-NN`, mark it RESOLVED in `docs/02-prd.md` §10
  with a one-line pointer.
- If a `DEC-NNN` no longer reflects reality, supersede it with a new
  `DEC-NNN` rather than editing history (decisions-log convention).
- Update the relevant `AGENTS.md` if the conventions themselves change.

---

*If anything here contradicts a per-stack `AGENTS.md`, the more specific one
wins for that subtree. If anything contradicts `docs/03-decisions.md`, the
decisions log wins and this file should be fixed.*
