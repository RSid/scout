# Runbook: swap the geocoder implementation (`GeocodingProvider`)

## Overview

Geocoding is isolated behind `GeocodingProvider`
(`apps/backend/scout/clients/geocoding/protocol.py`) and wired in
`get_geocoding_provider` (`apps/backend/scout/clients/__init__.py`). Browser traffic
must use Scout’s `/api/geocode/*` endpoints only (`DEC-023`; prior steps documented in
`DEC-022` / `DEC-008`). The **default** prod-style implementation reads Washington,
DC **Master Address Repository** rows materialized into Postgres (`dc_addresses`).

Use this checklist when swapping to a different upstream, dataset snapshot, **or**
self-hosted autocomplete engine:

1. If the adapter makes **network** calls during requests, stop and audit the vendor
   acceptable-use / TOS docs first — repo-root `AGENTS.md` rule #12 is binding.
   Local-only adapters (MAR snapshot via SQL) still need OCTO attribution discipline
   (see About page + `infra/runbooks/refresh-dc-addresses.md`).
2. Any material architectural change earns a **new `DEC-NNN`** instead of rewriting
   old decision history.

## Implementation checklist

### Adapter (`apps/backend/scout/clients/geocoding/`)

- Add or replace `<impl>.py` implementing `async def search` +
  `async def reverse`.
- Speak Scout-domain **`AddressHit`** (`id`, `label`, `lon`, `lat`); wire payloads
  never leak above the adapter.
- Geography helpers (bbox checks, buffering) reuse `scout.data.region` /
  GeoAlchemy2 patterns already used by routing.

### Config + factory

- `apps/backend/scout/config.py`: extend `SCOUT_GEOCODING_PROVIDER` enum + typed
  fields for any outbound HTTP settings.
- `apps/backend/scout/clients/__init__.py`: dispatch to the adapter; keep this the
  only import site for vendor modules (`DEC-020`).

### HTTP surface (`FastAPI`)

- If the adapter needs DB sessions (`LocalDcGeocodingProvider` today), extend
  `/api/geocode/*` deps in `scout/api/geocode.py` — **do not** leak `AsyncSession`
  into callers.
- Never relax the pinned JSON contract tests (`apps/backend/tests/test_geocode.py`).

### Product + compliance docs

- When user-visible plumbing changes, revise `apps/web/app/privacy/page.tsx`,
  optionally About, prompts, infra docs, README.

### Tests + tooling mocks

- Add focused adapter tests (+ contract tests remain untouched).
- **Mocks obey** `AGENTS.md` `# MOCK:` commenting + PR bullets.

### Env matrix

Touch `.env.example`, Compose files, `.github/workflows/ci.yml`, Makefile comments,
scripts registry (`scripts/AGENTS.md`).

## Verification (must stay green locally / CI)

```bash
cd apps/backend && uv run pytest && uv run mypy scout && uv run ruff check .
cd apps/web && pnpm lint && pnpm typecheck && pnpm test
```

## Rollout cues

**Snapshot refresh only** (`local_dc`): follow `infra/runbooks/refresh-dc-addresses.md`
— no outbound HTTP toggle is required beyond redeploy.

**Upstream swap**: flip provider env vars in Compose realistic overlay → smoke UI →
staging → production.
