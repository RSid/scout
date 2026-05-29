# Scout Web (M1)

Next.js 15 App Router frontend for corridor previews (`PRD §6.1`). Prefers **`pnpm`** for installs per `apps/web/AGENTS.md`; **`package-lock.json` is retained** because some environments lack a working Corepack/pnpm signature—**`npm ci`** is acceptable when documented in the PR.

## Commands

```bash
pnpm install   # preferred
pnpm dev       # NEXT_PUBLIC_* env documented in playbook

pnpm run build
pnpm run lint
pnpm test
pnpm run test:coverage
pnpm exec playwright install chromium  # once per machine
pnpm run e2e              # full local suite (stub + interactive)
pnpm run e2e:stub         # fast path: no MapLibre tiles (matches CI stub job)
pnpm run e2e:interactive  # MapLibre + dc.pmtiles (matches CI interactive job)
```

Vitest scopes coverage instrumentation to **`components/`** + **`lib/`** and skips **`BasemapInner.tsx`** (WebGL-heavy MapLibre surface). **Branch %** from Radix/React Aria is not threshold-gated—see **`vitest.config.ts`**.

Playwright mocks **`GET /api/categories`** + **`POST /api/route-features`**, stubs onboarding via **`localStorage`**, and runs axe on `/`, `/about`, `/privacy`, `/accessibility`, `/plan`. **`@mobile`** tests run at 375px only; **`@interactive`** tests need `NEXT_PUBLIC_SCOUT_MAP_MODE=interactive` and `scripts/build_pmtiles.sh` (see CI `web-e2e-*` jobs in `.github/workflows/ci.yml`).

## Contracts

Everything talks to FastAPI via HTTP only—see **`lib/api.ts`**. Never import Python code.
