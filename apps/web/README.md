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

Playwright mocks **`GET /api/categories`** + **`POST /api/route-features`**, stubs onboarding via **`localStorage`**, and runs axe on `/`, `/about`, `/privacy`, `/accessibility`, `/plan`. **`@mobile`** tests run at 375px; **`@mobile320`** at 320px; **`@interactive`** tests need `NEXT_PUBLIC_SCOUT_MAP_MODE=interactive` and `scripts/build_pmtiles.sh` (see CI `web-e2e-*` jobs in `.github/workflows/ci.yml`).

## UTM campaign tracking

Privacy-first, aggregate-only visit counting. No cookies, no PII, no third-party scripts. The Next.js middleware (`middleware.ts`) reads UTM query parameters on page load and sends them to the backend, which stores daily aggregate counts in Postgres.

### Creating a campaign link

Append UTM parameters to any Scout URL:

```
https://scoutdc.org/?utm_source=qr_flier&utm_medium=print&utm_campaign=summer2026
```

| Parameter      | Required | Example      | Description                         |
| -------------- | -------- | ------------ | ----------------------------------- |
| `utm_source`   | Yes      | `qr_flier`   | Where the visitor came from         |
| `utm_medium`   | No       | `print`      | Channel type (print, email, social) |
| `utm_campaign` | No       | `summer2026` | Specific campaign name              |

Values are case-sensitive and limited to 200 characters. The middleware fires on `/`, `/plan`, and `/about` (configured in `middleware.ts`).

### Querying results

Connect to the Postgres database and run:

```sql
-- All visits, most recent first
SELECT source, medium, campaign, visited_date, hit_count
FROM utm_visits
ORDER BY visited_date DESC;

-- Total hits per source
SELECT source, SUM(hit_count) AS total
FROM utm_visits
GROUP BY source
ORDER BY total DESC;

-- Hits for a specific campaign over time
SELECT visited_date, hit_count
FROM utm_visits
WHERE source = 'qr_flier' AND campaign = 'summer2026'
ORDER BY visited_date;
```

The `utm_visits` table stores one row per unique `(source, medium, campaign, date)` combination with a `hit_count` that increments on each visit. The migration is in `apps/backend/alembic/versions/0005_utm_visits.py`.

## Analytics (Umami Cloud)

Privacy-friendly visitor analytics via [Umami Cloud](https://cloud.umami.is) (hobby tier — free, no cookies). The tracking script loads only when `SCOUT_UMAMI_WEBSITE_ID` is set.

### Setup

1. Create a free account at [cloud.umami.is](https://cloud.umami.is).
2. Add a website (e.g. `scout-dc.com`) and copy the **Website ID** (a UUID).
3. Set the env var:
   - **Local dev**: add `SCOUT_UMAMI_WEBSITE_ID=<your-id>` to `.env` (optional — leave unset to disable tracking locally).
   - **Production**: set it in `.env` on the host. The prod compose passes it as a Docker build arg, so the value is baked into the Next.js standalone bundle at image build time. `make release` rebuilds the image automatically.
4. Deploy (or restart for local dev). The script tag in `app/layout.tsx` renders only when the env var was set at build time.

### Verifying

Open browser DevTools → Network tab. If the env var is set, you should see a request to `https://cloud.umami.is/script.js`. Visit data appears in your Umami Cloud dashboard within a few minutes.

## Contracts

Everything talks to FastAPI via HTTP only—see **`lib/api.ts`**. Never import Python code.
