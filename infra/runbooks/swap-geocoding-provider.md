# Runbook: swap the geocoding upstream

## Overview

Geocoding is vendor-isolated behind `GeocodingProvider`
(`apps/backend/scout/clients/geocoding/protocol.py`) and wired in
`get_geocoding_provider` (`apps/backend/scout/clients/__init__.py`). Browser
traffic MUST use Scout’s `/api/geocode/*` endpoints only (`DEC-022`). Use this
runbook when replacing or adding a backend geocoder (e.g. self-hosted Photon,
managed API). See `DEC-020` for the adapter boundary and repo root `AGENTS.md`
rule #12 for third-party terms-of-use review **before** any new outbound HTTP.

## Pre-flight

1. Read the provider’s acceptable-use / TOS documentation for autocomplete,
   rate limits, attribution, and redistribution.
2. If usage is ambiguous or might violate terms, stop and escalate in the PR
   (**Third-party TOS review** section) rather than merging on a guess.
3. Record the decision in `docs/03-decisions.md` as a new `DEC-NNN` that
   supersedes the prior geocoding decision when the rationale or upstream
   materially changes.

## Implementation checklist

### Adapter

- Add `apps/backend/scout/clients/geocoding/<vendor>.py`:
  - Implement `async def search` and `async def reverse`.
  - Map upstream payloads to Scout-domain `AddressHit` (`id`, `label`, `lon`,
    `lat`); wire shapes stay inside this module.
  - If the upstream needs a bounded area, prefer importing bounds from
    `scout.data.region` (`DC_BBOX_LON_LAT`) and translating to wire format here.

### Config

- Extend `apps/backend/scout/config.py`:
  - `geocoding_provider` Literal / description (existing pattern: `photon |
    stub`).
  - `<vendor>_base_url`, `<vendor>_user_agent`, and auth fields if required.

### Factory

- Update `apps/backend/scout/clients/__init__.py` `get_geocoding_provider` to
  select the new implementation when configured.

### Tests

- Add `apps/backend/tests/test_<vendor>_adapter.py` with `httpx` + `respx` to
  assert outbound URLs, translation to `AddressHit`, and error mapping.
- **Do not weaken** existing contract tests in `apps/backend/tests/test_geocode.py`
  (`test_*_response_shape_is_pinned`); they lock the `/api/geocode/*` JSON shape.

### Env and infra

- Update `.env.example`, `infra/docker-compose.yml`, and
  `infra/docker-compose.realistic.yml` with the new vars and sane defaults.

### Product / compliance

- Update `apps/web/app/privacy/page.tsx` if the user-visible data flow changes.

### Decision log

- Add or supersede the relevant row in `docs/03-decisions.md`.

## Verification (must be green locally / CI)

From `apps/backend`:

- `uv run pytest`
- `uv run mypy .`
- `uv run ruff check .`

From `apps/web`:

- `pnpm test` / `pnpm run test` per project conventions
- `pnpm run typecheck`
- `pnpm run lint`

## Rollout

1. Deploy with `SCOUT_GEOCODING_PROVIDER` (and related URL / secret env vars)
   pointing at the new adapter in a staging / realistic Compose profile first.
2. Smoke-test autocomplete and reverse geocode in the UI.
3. Flip production config only after telemetry and logs look healthy.

## Quick grep reminders

After the swap, search `apps/` for vendor-specific remnants (paths, secrets,
obsolete env vars). Only Photon-specific filenames, `SCOUT_PHOTON_*`, and docs
about the Photon adapter should remain if Photon is still a supported upstream.
