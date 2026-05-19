# Scout — Technical & product decisions log

ADR-style. Each decision has a stable ID (`DEC-NNN`), the question it answers, the
options considered (briefly), the choice, the rationale, and the consequences. Reverse
a decision by adding a new `DEC-NNN` that supersedes the old one — don't edit history.

Items marked **[needs your sign-off]** are decisions I've drafted but want you to
confirm before they harden.

---

## DEC-001 — Frontend framework: Next.js 15 (App Router) + TypeScript + Tailwind

**Context.** Frontend will be SPA-ish but benefits from SSR for the landing page (SEO,
disclaimer must render without JS) and from file-based routing (fits the app's small
surface area).

**Options considered.**
- **Plain React + Vite.** Pros: simple, no framework lock-in. Cons: no SSR for the
  landing page; we'd hand-roll it.
- **Next.js 15 (App Router).** Pros: SSR for the landing page; mature; you already
  know it; great accessibility primitives in React.
- **Remix / React Router 7.** Pros: clean data loading model. Cons: smaller ecosystem,
  less inertia for new contributors.
- **SvelteKit.** Pros: smaller bundles, ergonomic. Cons: not your default; smaller
  contributor pool for a community project.

**Decision.** Next.js 15 with the App Router, TypeScript strict, Tailwind for styling.

**Rationale.**
- You stated familiarity with React/Next/TypeScript; community of contributors is
  largest there.
- App Router's RSC + streaming improves first-paint on the route-feature list view.
- Tailwind gives us focus/contrast utilities out of the box; less custom CSS = less
  accessibility regression surface.

**Consequences.**
- We accept a `node_modules` footprint, but the production bundle stays small if we
  avoid client components where possible (the landing page should be fully server
  rendered).
- Means a Node runtime in the container, even though backend is Python. Multi-stage
  Docker build handles this.

---

## DEC-002 — Mapping: MapLibre GL JS + Protomaps PMTiles (self-hosted), no external tile API

**Context.** We need vector basemaps for DC, free of per-tile-request fees, with
acceptable rendering performance on mobile.

**Options considered.**
- **Google Maps JS API.** Free tier is small, paid tier expensive at scale, no
  accessibility-aware data. Rejected (also a stated preference shift).
- **Mapbox GL JS + Mapbox tiles.** Generous free tier (50k loads/month) but billable
  above. License also restricts derivative open-source map styles in some cases.
- **MapLibre GL JS + Stadia Maps / MapTiler tiles.** Free tier exists; per-tile call
  patterns make it harder to predict cost.
- **MapLibre GL JS + Protomaps PMTiles.** A single static `.pmtiles` file for DC
  served via HTTP range requests from our own origin. Zero per-tile cost. Open
  spec. Tiles are OSM-derived under ODbL.

**Decision.** MapLibre GL JS + self-hosted Protomaps PMTiles.

**Rationale.**
- Zero budget mandate (per your selection). Self-hosted PMTiles is the only fully
  free-at-scale option.
- DC bounding box at z=0–16 fits comfortably under 100 MB. Trivial to serve from
  the same container as the API.
- Open-source-first matches AGPL ethos.

**Consequences.**
- We commit to a tile-build step (`build_pmtiles.sh`) in CI / docs.
- Tile updates are explicit (rebuild + redeploy) rather than continuous. OK for
  DC's data velocity.
- Required attribution: "© OpenStreetMap contributors" on the map (we'll do that
  anyway).

---

## DEC-003 — Routing engine: OpenRouteService, wheelchair profile, public API in M1

**Context.** We need wheelchair-aware walking routes — meaning routes that respect
OSM `wheelchair=*`, `kerb=*`, `surface=*`, `incline=*`, `tactile_paving=*` tags.

**Options considered.**
- **Google Directions API.** No exposed wheelchair profile via the public API.
  Rejected.
- **Mapbox Directions API.** Walking profile is not accessibility-aware. Rejected.
- **OpenRouteService (public hosted).** Has an explicit `wheelchair` profile.
  Free-tier rate limit: ~2000 requests/day with daily cap. AGPL-friendly.
- **OSRM (self-hosted).** Fast, but lacks a wheelchair-specific profile out of the
  box.
- **Valhalla (self-hosted).** Has a `pedestrian` profile with wheelchair-ish
  options; setup is heavier.

**Decision.** OpenRouteService public API in M1; document self-hosting as a fallback
when traffic exceeds 1500 req/day (per OQ-10).

**Rationale.**
- ORS is the only mature option with a true wheelchair profile we don't have to
  hand-build.
- Their free tier matches our likely M1 audience (tens of users, then hundreds).
- Self-hosting ORS is a documented procedure with docker images.

**Consequences.**
- We commit to instrumenting routing call volume from day one.
- Fallback plan adds a future M2/M3 ops task to deploy a self-hosted ORS
  container on Fly.io (memory profile: ~2 GB for a DC-region extract).
- Cache results aggressively (M1-F04) to delay hitting limits.

---

## DEC-004 — Data store for M1: in-memory Python (shapely + STRtree), not SQLite/Spatialite

**Context.** ~88k point features (plus restrooms via API) need fast spatial query
("features within X meters of this LineString"). Solo dev wants zero ops complexity.

**Options considered.**
- **PostGIS.** Industry standard for geo. Overkill at this scale; adds a moving
  part (Postgres container) that has no other M1 purpose.
- **SQLite + Spatialite.** Single file; embedded; supports R-tree. Spatialite has
  platform-specific install pain (especially on Alpine in Docker).
- **In-memory shapely + STRtree, hydrated from GeoJSON at startup.** Simple,
  zero ops, fast for our size. Lose persistence of writes (none in M1 anyway).

**Decision.** In-memory shapely + STRtree at startup. Persist nothing in M1
beyond the source GeoJSONs in the repo.

**Rationale.**
- M1 has *no user writes*. Read-only data fits memory comfortably (~88k points
  is ~30 MB in shapely).
- Eliminates a moving part. Faster CI. Easier "clone & run" for contributors.
- DEC-014 (Postgres in M3) takes over when writes appear.

**Consequences.**
- Cold start cost: parse + index time of ~3 s on a small machine. Acceptable; Fly
  autostart handles it. Add a startup log line for visibility.
- If memory becomes a constraint (it won't at this size), we revisit with
  Spatialite or PostGIS.

---

## DEC-005 — License: AGPL-3.0

**Context.** You selected AGPL. Re-confirming the implications so they're explicit.

**Decision.** AGPL-3.0. Add `LICENSE` and SPDX headers in source files.

**Rationale.**
- A fork that runs Scout as a hosted service must also publish source. Protects
  the civic-good intent against being absorbed into a closed app.
- All chosen dependencies are AGPL-compatible (MapLibre BSD-3, FastAPI MIT,
  OpenRouteService MIT, Protomaps BSD-3, OSM data ODbL, Refuge Restrooms CC0).

**Consequences.**
- Some companies (notably Google) avoid AGPL code in their commercial products —
  acceptable for a civic project.
- Contributors must understand AGPL implications. We'll state this in
  CONTRIBUTING.md.
- DCO (Developer Certificate of Origin) sign-off enforced on PRs.

---

## DEC-006 — Hosting: Fly.io for app + tiles; no separate CDN in M1

**Context.** Zero budget. Need durable, container-native hosting.

**Options considered.**
- **Fly.io.** Generous free tier, Docker-native, multi-region capable.
- **Railway / Render.** Comparable. Marginally less control.
- **Hetzner VPS + Docker Compose + Caddy.** Cheapest at scale but more ops work.
- **AWS / GCP.** Overkill at this stage.

**Decision.** Fly.io. Single small machine. Same machine serves the API, the static
Next.js export, and the PMTiles file.

**Rationale.**
- Free-tier supports our M1 needs.
- One artifact (Docker image) to ship.
- We can scale horizontally later or move to Hetzner if Fly's free tier changes.

**Consequences.**
- Fly auto-stop saves money but adds cold-start latency; mitigated by aggressive
  caching and small image size.
- DNS at the project's chosen domain points to Fly. Add a `Caddyfile`-equivalent
  via Fly proxy or use a Cloudflare proxy if HTTPS / WAF becomes a need.

---

## DEC-007 — Authentication strategy: deferred to M3; magic-link email when added

**Context.** You chose "no auth in MVP." In M3, accounts are needed for user
contributions.

**Decision.** No auth in M1 or M2. When added in M3, use magic-link email only —
no passwords ever.

**Rationale.**
- Defers privacy/security surface.
- When added, magic links sidestep password storage, password reset flows, and
  most credential-stuffing attacks. Lowest-complexity option.
- Optionally augment with passkeys in M4 for users who want fast re-auth.

**Consequences.**
- M3 introduces a transactional email dependency (Resend, Postmark, or
  Mailchannels via Cloudflare). All have free tiers; specific choice deferred to
  M3 sprint.

---

## DEC-008 — Geocoding: Nominatim (OSM), DC-bounded, with strict rate limits

**Context.** Address autocomplete is in M1.

**Options considered.**
- **Google Places Autocomplete.** Paid above small free tier. Rejected.
- **Mapbox Geocoding.** Paid above. Rejected.
- **Photon (self-hosted, on OSM data).** Heavy to host.
- **Nominatim public API.** Free, but usage policy: < 1 req/sec, bulk usage
  must self-host.

**Decision.** Nominatim public API with 500 ms client debounce + server rate
limit (max 1 req/sec). Document self-hosting if usage warrants.

**Rationale.**
- Lowest ops cost in M1. DC has comprehensive OSM coverage so quality is good.

**Consequences.**
- If we ever blow Nominatim's policy, we self-host Photon (lighter than
  self-hosting Nominatim). Pre-document the runbook.

---

## DEC-009 — Accessibility target: WCAG 2.2 AA across the board, AAA where it doesn't fight UX

**Context.** WCAG 2.2 is the current standard. AA is the contractual baseline
most jurisdictions use. AAA is aspirational and sometimes self-contradicting
(e.g., AAA contrast plus a rich map UI is tough).

**Decision.** WCAG 2.2 AA in entirety. AAA pursued for: 1.4.6 (enhanced contrast)
where the design allows; 2.4.8 (location) via persistent breadcrumb on multi-step
flows; 3.1.5 (reading level) — keep all microcopy at lower-secondary reading level.

**Rationale.**
- AA is checkable, defensible, and table-stakes for an accessibility app.
- Targeted AAA wins matter (especially reading level, given cognitive accessibility
  is a stated future persona).

**Consequences.**
- M1-F10 audit gates MVP launch.
- CI gate via `@axe-core/playwright` runs on every PR.

---

## DEC-010 — Liability disclaimer pattern: persistent banner + first-visit onboarding modal

**Context.** A routing app for disability accessibility carries non-trivial liability
risk if data is wrong. Per OQ-07.

**Decision.** Two-layer disclaimer:
1. **Persistent visible banner** on the route view: short, dismissible-per-session,
   linking to the full disclaimer at `/about#disclaimer`.
2. **First-visit onboarding modal** that introduces the app, asks for accessibility
   preferences, and includes the disclaimer text (acknowledged by an explicit
   "Got it" button — but no consent-blocking gate on subsequent visits).

**Rationale.**
- A one-time hard click-through ("I agree") is patronizing for a tool people will
  use repeatedly.
- The persistent banner satisfies the "always informed" need.
- Modal does the heavy explanation once.

**Consequences.**
- Onboarding modal needs strong accessibility (focus trap, screen reader
  announcement, skip path).
- "Got it" state stored in `localStorage` only; no server identity needed.

---

## DEC-011 — Repo layout: monorepo with `apps/backend` + `apps/web`

**Context.** One language stack per side (Python backend, Node frontend). Could
do two repos, but solo dev + shared CI argues for one.

**Decision.** Monorepo. See PRD §8 for the layout.

**Rationale.**
- Single PR can touch both sides for consistent API changes.
- Single CI pipeline, single Dockerfile, single deploy.
- No "version skew" between FE/BE.

**Consequences.**
- We pick a build tool that handles Python + Node coexisting. `make` is enough at
  M1. Avoid Turborepo / Nx until they earn their keep.

---

## DEC-012 — Testing stack

**Context.** Open-source civic project; reviewers and contributors need to trust
the test suite.

**Decision.**
- **Backend:** `pytest` + `httpx` for API tests; `pytest-randomly` to catch
  order-dependent tests; `pytest-cov` reporting against a 70% line coverage floor
  for `apps/backend/scout/`.
- **Frontend unit:** Vitest + React Testing Library + jest-axe for component-level
  a11y assertions.
- **Frontend E2E:** Playwright + `@axe-core/playwright` for end-to-end + WCAG checks.
- **CI:** GitHub Actions runs all three on every PR.

**Rationale.**
- Standard, well-documented tooling. No exotic dependencies.
- a11y is gated by both unit (jest-axe) and E2E (axe-core/playwright) — defense
  in depth.

**Consequences.**
- Playwright adds CI minutes. Acceptable on GHA's free tier.

---

## DEC-013 — i18n: scaffolded in M1, real translations in M2; library = `next-intl`

**Context.** DC has significant Spanish-speaking, Amharic-speaking, and other
non-English-primary populations.

**Decision.** M1: extract strings via `next-intl`; ship English only. M2: add
Spanish (community-translatable via Crowdin or similar). Other languages by
demand.

**Rationale.**
- Doing extraction late costs 3× more than doing it from day one.
- next-intl works natively with the App Router and is actively maintained.

**Consequences.**
- One string-management convention from the start. Codify in CONTRIBUTING.md.

---

## DEC-014 — Data store in M3: Postgres + PostGIS via Fly Postgres

**Context.** When user contributions land (M3), we need a real, writable, indexable
geospatial store.

**Decision.** Postgres with PostGIS extension, hosted on Fly Postgres in prod;
docker-compose for dev. Alembic for migrations.

**Rationale.**
- PostGIS is the established standard.
- Fly Postgres is operationally light; we already host on Fly.
- `pyproject.toml` already declares `psycopg2-binary`, `sqlalchemy`, `alembic` —
  the user has signaled intent for this path.

**Consequences.**
- Migration tooling becomes important. `alembic` covers schema; data backfill
  needs a separate scripted pass for the M1 in-memory features → DB.

---

## DEC-015 — Color palette: IBM color-blind-safe baseline, designer pass in M2

**Context.** Accessibility app must be accessible *visually* including for users
with color vision differences.

**Decision.** M1 uses IBM's color-blind-safe palette
(https://www.ibm.com/design/language/color/) for category colors. M2 commissions
a designer pass for brand polish — but the new palette must pass the same
color-blind tests.

**Rationale.**
- IBM's palette is vetted across protanopia/deuteranopia/tritanopia.
- Solo-dev-friendly to use a pre-validated palette in M1.

**Consequences.**
- Designer brief must include color-blind constraints in M2.

---

## DEC-016 — Service worker scope in M1: app shell only, no API caching

**Context.** PWA installability is desirable; full offline support is M2.

**Decision.** M1 service worker caches the Next.js app shell and the PMTiles file.
No `/api/*` caching in M1.

**Rationale.**
- Caching API responses without invalidation is dangerous in an accessibility
  context (we don't want users to act on stale "route" results without knowing).
- The simpler scope lets us ship the PWA install affordance without complexity.

**Consequences.**
- M2-F22 fills in real offline support, scoped to recently-viewed routes.

---

## DEC-017 — CI/CD: GitHub Actions, deploy on push to `main`

**Context.** Standard for OSS; integrates with PR checks.

**Decision.**
- `ci.yml`: runs on every PR. Lints (`ruff` for Python, `eslint` for TS), unit
  tests, Playwright E2E with axe, builds the Docker image (no push).
- `deploy.yml`: runs on push to `main`. Re-runs tests, builds + pushes the image,
  deploys to Fly via `flyctl deploy`.
- Branch protection on `main`: requires green CI + 1 review for human contributors;
  solo-dev can self-merge with a documented exception.

**Rationale.**
- Cheapest, most familiar, contributor-friendly.

**Consequences.**
- Fly API token stored as a GHA secret. Rotate on key incidents.

---

## DEC-018 — Naming: project name = `scout`

**Context.** The repo is already named `scout`. The product name is undecided.

**Decision.** Use `scout` for the code identifier (repo, package, container) and
adopt it as the working product name until M1 launch. Reconsider the product name
in a M1.5 marketing pass if you ever want to rebrand for launch outreach.

**Rationale.**
- `scout` evokes "scouting ahead" — apt for pre-trip planning.
- One name now, two later (code vs. brand) is fine if and when we split.

**Consequences.** Domain, social handles, etc. flow from this. `scout.app` is
gone; `scoutdc.org` and similar are likely available. **[needs your sign-off]**
on the final brand decision before M1 ships.

---

## Decisions still to make (early)

These don't block scaffolding but should be settled before M1 ships:

- **DEC-PEND-A** — Final brand / product-facing name. (See DEC-018.)
- **DEC-PEND-B** — Domain name and DNS provider.
- **DEC-PEND-C** — Whether to seek a partner (DC chapter of disability advocacy
  org, e.g. DC Disability Rights Center, Independence Now) before public launch.
  This affects the disclaimer language and the user-research approach.
- **DEC-PEND-D** — Email provider for M3 magic links (Resend, Postmark, Mailchannels).
- **DEC-PEND-E** — Whether the M1 launch is a "soft launch" (linked from your
  personal channels and disability-org Slack/Discord groups) or a "public launch"
  (blog post, social, local press). Affects how aggressive the disclaimer needs
  to be.

---

*End of decisions log.*
