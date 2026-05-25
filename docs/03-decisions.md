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

## DEC-004 — *Superseded by DEC-019.* (Original: in-memory shapely + STRtree.)

The original decision proposed an in-memory store for M1 to minimize ops, then
migrating to PostGIS in M3. After analysis (see DEC-019), the M3-refactor cost
(~3 days) outweighs the M1-ops cost of running Postgres from day one, and
PostgreSQL is more contributor-approachable than the alternatives. DEC-004 is
retained for traceability; DEC-019 is the active decision.

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

**Upgrade paths (if Scout grows or budget appears).** Each is independently
takeable; none of them require a re-architecture.

| Symptom | First lever (no/low cost) | Next lever (small budget) |
|---|---|---|
| Cold-start latency annoys users | `min_machines_running = 1` on Fly (still free with caveats) | Reserve a small always-on machine |
| Tile bandwidth costs (if we ever hit them) | Front Fly with a Cloudflare proxy (free tier, caches PMTiles ranges) | Move PMTiles to R2/Backblaze + CDN |
| ORS rate limit hit | Self-host ORS in a sibling Fly VM | Pay for an ORS Pro key |
| Geocoding capacity ceiling | Refresh the bundled MAR snapshot (`scripts/ingest_dc_addresses.py`) or add read replicas | Commercial global geocoder (privacy/cost trade-off) |
| Postgres I/O ceiling | Bigger Fly PG plan | Move to Neon/Supabase if cheaper |
| Email volume (M3+) | Cloudflare Email Workers / Mailchannels free | Postmark/Resend |
| Analytics privacy without spend | Plausible self-hosted | Plausible Cloud |

Each lever is documented as a runbook in `infra/runbooks/` (to be written during
M1-F15). The intent: when a constraint bites, the fix is *one runbook away*, not
a re-platforming project.

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

## DEC-008 — *Superseded by DEC-022.* (Original: Geocoding via Nominatim public API.)

**Status.** Superseded by `DEC-023` (bundled DC MAR snapshot). The original
rationale assumed a 500 ms client debounce plus server rate limit was
sufficient to stay inside the OSMF Nominatim Acceptable Use Policy. On
re-reading the policy
(<https://operations.osmfoundation.org/policies/nominatim/>) the *Auto-complete
search* clause categorically prohibits using the public Nominatim service for
autocomplete, regardless of debounce or rate limit. Moving the call server-side
does not cure that — the prohibition is on the use case, not on the request
origin. `DEC-022` moved traffic to Photon; `DEC-023` removes upstream
geocoding entirely for M1. See `DEC-023` for the active path.

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
- See `docs/contributor/voice-and-copy.md` §3 for the concrete reading-level
  numbers (FK ≤ 8 body, ≤ 6 microcopy) and how to test them before merging.

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
- See `docs/contributor/voice-and-copy.md` §8 for trust-copy tone rules and
  the L1–L4 trust ladder that refines this two-layer pattern at the
  copy level.

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

## DEC-014 — *Folded into DEC-019.* (Original: PostGIS arriving in M3.)

Since PostgreSQL + PostGIS now lands in M1 (per DEC-019), M3 inherits the
schema rather than introducing it. M3-specific additions (user submissions,
moderation queue, accounts) are pure additive migrations on top of the M1
schema. No separate "M3 data-store decision" is needed.

---

## DEC-015 — Visual design system: produced by a dedicated design pass before M1 frontend coding

**Context.** Accessibility app must be accessible *visually* including for users
with color vision differences, AND must reflect a coherent aesthetic. The
project owner has explicit aesthetic input and wants to drive a design pass with
a separate agent rather than have the scaffolding agent guess.

**Decision.** Run a dedicated design-system pass (see
`docs/prompts/07-design-system.md`) before — or in parallel with — the M1
frontend scaffolding. That pass produces:

- Color tokens (light + dark) with documented contrast ratios and color-blind
  safety verification.
- Typography scale and font choice (self-hosted, no Google Fonts).
- Spacing scale, radius scale, elevation scale.
- Map marker shape language (obstacle family vs. aid family) — shape carries
  meaning so color is never the sole signal.
- Focus indicator pattern.
- Disclaimer banner and onboarding modal mockups.
- Component pattern library for: button, input, combobox, modal, popover,
  list-item-details, banner, chip, toggle.

**Non-negotiable constraints the design pass must honor.**

- WCAG 2.2 AA contrast minimums (4.5:1 text, 3:1 large/UI).
- Targeted AAA 1.4.6 where the design permits.
- Color-blind safety verified against protanopia, deuteranopia, and tritanopia.
- `prefers-reduced-motion` and `prefers-color-scheme` honored.
- Touch targets ≥ 44×44 px.
- Map markers differentiated by **shape AND color**, not color alone.
- Focus indicators with ≥ 3:1 contrast against adjacent fills.

**Rationale.**
- Bringing aesthetic input early prevents a "designed by an engineer" feel.
- Locking the constraints means the designer's freedom is bounded by what we
  can ship accessibly.
- Decoupling design from frontend scaffolding lets the engineering agent focus
  on behavior, not bikeshedding colors.

**Consequences.**
- Frontend scaffold prompt (`prompts/03-scaffold-frontend-m1.md`) will reference
  the design tokens file produced by the design pass, not embed colors inline.
- If the design pass slips, the frontend agent can scaffold against the
  IBM-color-blind-safe palette as a temporary fallback, behind a thin tokens
  module that the designer can later swap.

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

## DEC-019 — Data store: PostgreSQL + PostGIS from M1, self-hosted in a sibling Fly VM

**Supersedes:** DEC-004. **Folds in:** DEC-014.

**Context.** ~88k point features in M1 (read-only DC data), growing to include
user contributions in M3 (writes, moderation queue, accounts). We considered
deferring Postgres to M3 to keep M1 minimal, but the refactor cost
(~3 engineer-days) plus the soft cost of in-memory-store assumptions leaking
into call sites outweighs the one-time setup cost of bringing Postgres in from
the start. The owner's already-declared `psycopg2-binary` / `sqlalchemy` /
`alembic` dependencies signaled the intended end-state.

**Decision.** PostgreSQL 16 with the PostGIS 3.x extension is the data store
for M1 through M4. Self-hosted in a **sibling Fly VM** (separate `fly.toml`
from the app) with a Fly-managed volume for persistence, fitting the
zero-budget constraint (Fly's free tier includes 3 GB of persistent volume).
The app connects via `SCOUT_DATABASE_URL`. SQLAlchemy 2.x is the ORM,
GeoAlchemy2 provides the PostGIS bindings, Alembic owns the schema.

**M1 schema (one table).**

```sql
CREATE TABLE features (
    id                    text PRIMARY KEY,             -- "{source_dataset}:{source_id}"
    category              text NOT NULL,
    kind                  text NOT NULL,                -- 'obstacle' | 'aid'
    condition             text,                         -- raw source value
    condition_normalized  text NOT NULL,
    inspected_year        smallint,
    source_dataset        text NOT NULL,
    source_id             text NOT NULL,
    attributes            jsonb NOT NULL DEFAULT '{}',
    geom                  geography(Point, 4326) NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX features_geom_idx        ON features USING GIST (geom);
CREATE INDEX features_category_idx    ON features (category);
CREATE INDEX features_source_dataset  ON features (source_dataset);
```

Corridor query in M1 uses `ST_DWithin(geom, ST_GeographyFromText(:line), :buffer_m)`
on the `geography` column — automatically handles WGS84 distances in meters
without per-query reprojection.

**Options considered.**
- **In-memory shapely + STRtree (original DEC-004).** Smallest M1 footprint;
  requires a ~3-day refactor at M3.
- **SQLite + SpatiaLite + GeoAlchemy2.** Zero-ops in M1 with ORM continuity,
  but SpatiaLite has platform install friction (Alpine vs Debian-slim,
  `load_extension` quirks) and most contributors don't know it.
- **PostgreSQL + PostGIS, Fly Managed Postgres.** Lowest ops; small monthly
  cost above the smallest free tier; subject to Fly's pricing-model changes.
- **PostgreSQL + PostGIS, self-hosted in a Fly VM** *(chosen).* Owner-confirmed
  preference; fits zero budget; uses Fly's free volume; same DB engine across
  dev, CI, and prod.

**Hosting topology.**

- **Dev (docker-compose):** a `postgis/postgis:16-3.4` container with a named
  volume. `apps/backend` connects via the compose network.
- **CI (GitHub Actions):** a `postgis/postgis:16-3.4` service container;
  ephemeral.
- **Prod (Fly):** a separate Fly app (`scout-pg`) running
  `postgis/postgis:16-3.4` (or building from official Dockerfile pinned by
  digest) on a `shared-cpu-1x` machine with a 3 GB volume. The app connects
  via Fly's private network at `scout-pg.internal:5432`. Password injected via
  Fly secrets; no public listener.

**Rationale.**

- One DB engine across all environments; one SQL dialect; one set of
  migrations.
- PostGIS gives us real spatial SQL (`ST_DWithin`, `ST_Intersects`,
  `ST_LineSubstring`) — cleaner than buffering by hand in shapely and
  computing along-route distance in Python.
- Alembic + GeoAlchemy2 + SQLAlchemy 2.x is contributor-familiar. New
  contributors with web-app experience can ramp without learning a custom
  in-memory store or SpatiaLite quirks.
- Zero throw-away cost when M3 adds writes — just new migrations.

**Consequences.**

- One extra container in dev (`docker compose up` brings up app + PG).
- ~+2 s app cold start (DB connection establishment); offset by query speed
  improvements vs. in-memory STRtree once we have indexes.
- Backups: not required in M1 (data is reproducible from source GeoJSONs).
  Required in M3+ (user contributions). Documented as a runbook hand-off in
  `infra/runbooks/postgres-backup.md` to be authored when M3 starts.
- One sibling Fly app to operate. Trade-off accepted.

---

## DEC-020 — Third-party services accessed via vendor-agnostic adapters

**Context.** Scout integrates with several external services: routing
(OpenRouteService), geocoding (bundled DC MAR snapshot in Postgres), restroom
data (Refuge Restrooms), map tiles (Protomaps / OSM), and later email (M3).
Every one of these has plausible alternatives, and we may need to swap any of
them under budget pressure or rate-limit pressure (see DEC-006 upgrade paths).

**Decision.** Every third-party integration is accessed through a thin,
in-process **adapter / Port-Adapter** layer. The application code depends only
on the adapter interface (a Python `Protocol` for backend; a TypeScript
`interface` for frontend), never on the concrete provider SDK or HTTP client.

**Layout.**

Backend (`apps/backend/scout/clients/`):

```
clients/
├── routing/
│   ├── __init__.py          # exports RoutingProvider Protocol + get_provider()
│   ├── protocol.py          # RoutingProvider Protocol
│   ├── openrouteservice.py  # OpenRouteServiceProvider implementation
│   └── stub.py              # in-process fake for tests
├── geocoding/
│   ├── __init__.py
│   ├── protocol.py          # GeocodingProvider Protocol + AddressHit
│   ├── local_dc.py          # LocalDcGeocodingProvider (DEC-023)
│   └── stub.py
├── restrooms/
│   ├── __init__.py
│   ├── protocol.py          # RestroomProvider Protocol
│   ├── refuge.py
│   └── stub.py
└── email/                   # added in M3
    └── ...
```

Frontend mirrors the same pattern in `apps/web/lib/providers/` for any
client-side service.

**Provider selection.** `get_provider()` returns the concrete impl based on a
single env var per concern (`SCOUT_ROUTING_PROVIDER`, default
`openrouteservice`; `SCOUT_GEOCODING_PROVIDER`, default `local_dc` per
`DEC-023`;
etc.). Tests use `stub`. Production uses the real impl. Swap is one env var.

**Interface design rules.**

- Protocols define the *use case*, not the vendor. `RoutingProvider.walking_route(
  start, end, profile)` — not `ors_directions(...)`.
- Protocols return Scout-domain types (`Route`, `Address`, `Restroom`) — never
  the vendor's wire types.
- Vendor-specific error codes are translated to Scout error codes at the adapter
  boundary.
- Vendor-specific caching/rate-limiting lives inside the adapter; the caller
  doesn't know.

**Rationale.**

- Today's lock-in is cheap to introduce and expensive to remove. Adapters
  cost us ~50 lines per vendor; switching providers later costs us hours
  instead of weeks.
- Tests stay fast and offline; we use the `stub` adapter, never the wire.
- DEC-006's "upgrade paths" become drop-in swaps, not rewrites.

**Consequences.**

- A small amount of boilerplate per integration.
- New rule for PRs touching `clients/`: every new vendor adds a new
  implementation file under the existing protocol; doesn't change call sites.
- The frontend agent must consume the API as well-shaped JSON — they do not
  inline ORS-specific assumptions in components.

---

## DEC-021 — Voice and copy style binding to `docs/contributor/voice-and-copy.md`

**Context.** Scout's user-facing copy is shipped by humans and agents working
independently across many surfaces (homepage, About, banner, onboarding,
errors, freshness chips, aria-labels, live-region announcements). Without a
shared style, voice drifts — sober on one surface, jokey on another,
legalistic on a third — and accessibility-sensitive copy (link text,
aria-labels, error messages) regresses surface by surface. DEC-009 fixes the
reading level; DEC-010 fixes the disclaimer pattern; nothing yet fixes the
voice, terminology, or microcopy patterns.

**Decision.** `docs/contributor/voice-and-copy.md` is binding for all
user-facing copy in the Scout repo. Agents and humans must consult it before
adding or changing copy on any surface. It supersedes ad-hoc voice choices in
shipping code; conflicts are resolved by updating the code to match the guide.

**Rationale.**
- A written, binding voice is the only way multiple agents and contributors
  produce consistent copy.
- DEC-009's reading-level target is necessary but not sufficient — it
  doesn't tell anyone what words to actually pick.
- `docs/contributor/` is a new home for human-contributor-directed
  documentation (as opposed to product specifications under `docs/` or
  runtime code under `apps/`). Future style guides (commit conventions, PR
  norms beyond what AGENTS.md covers, etc.) will land in the same folder.

**Consequences.**
- New PRs that introduce or change user-facing copy may be asked in review
  to cite the section of the guide the copy satisfies.
- Existing copy that contradicts the guide (catalogued in a follow-up
  rewrite plan) is revised in subsequent PRs; this DEC does not retroactively
  block previously-shipped copy.
- When the guide and a `DEC-` decision conflict, the `DEC-` decision wins
  per the decisions-log convention.

---

## DEC-022 — *Superseded by DEC-023.* (Geocoding: Photon through the Scout backend; supersedes DEC-008)

**Context.** `DEC-008` chose the public Nominatim service for address
autocomplete with a 500 ms client debounce and a server rate limit. While
implementing `M1-F03` we shipped the call as a *direct* browser-to-Nominatim
`fetch`. Re-reading the
[OSMF Nominatim Acceptable Use Policy](https://operations.osmfoundation.org/policies/nominatim/)
surfaced three problems with our path:

1. The policy's *Auto-complete search* clause categorically forbids using the
   public Nominatim service for autocomplete — "you must not implement such a
   service on the client side using the API." The 500 ms debounce addresses
   the separate 1-req/sec cap, not this prohibition. Moving the call
   server-side would not fix it either; the policy bars the use case.
2. The policy requires a descriptive `User-Agent` ("stock User-Agents as set
   by http libraries will not do"). Browser `fetch` cannot set the
   `User-Agent` header, so the browser-direct path could not comply on the UA
   rule either.
3. The 1-req/sec cap was being enforced per *user IP*, not per Scout — a
   functional side-effect of the browser-direct path, not a defense of it.

We had also drifted from `DEC-008`'s own wording ("Nominatim public API with
500 ms client debounce **+ server rate limit**"), which implied the call went
through our backend.

**Options considered.** *(Confidence levels reflect the
implementing-agent's read at decision time, not a guarantee.)*

- **Self-hosted Photon, backend-proxied** *(chosen)* — purpose-built OSS
  autocomplete engine on OSM data; no autocomplete prohibition; we own UA,
  cache, rate-limit, and attribution surface. Already pre-blessed as the
  upgrade lever in `DEC-006`. ~85% confidence.
- **Komoot's hosted Photon at `photon.komoot.io`** — same engine, no infra,
  "low-volume / fair use" upstream policy. Adopted as the *dev / soft-launch*
  endpoint while self-hosting on Fly is staged in a follow-up PR. ~55%
  confidence on long-term suitability; sufficient for M1's friend-of-author
  soft-launch (`DEC-PEND-E`).
- **Mapbox Geocoding.** Best-in-class autocomplete, generous free tier.
  Rejected: conflicts with `DEC-002`'s deliberate avoidance of Mapbox
  vendor lock-in, and is a commercial logging surface for user-typed
  addresses (privacy posture under `NF-PRIV-*` is meant to avoid this).
- **MapTiler / Stadia / Geoapify.** Same shape as Mapbox; same trade-offs at
  a smaller scale; same `DEC-002`-adjacent concerns. Rejected.
- **Backend-proxy current Nominatim path (UA + server rate-limit), no
  engine change.** Fixes the UA and rate-attribution problems but does
  *not* address the autocomplete prohibition. Half-measure; rejected.
- **Drop autocomplete; one-shot geocode on submit.** Compliant but a UX
  regression for the disabled-user audience the PRD targets. Rejected.

**Decision.** Geocoding is served by **Photon**, accessed *only* via the
Scout backend through the `GeocodingProvider` adapter (`DEC-020`). The
frontend never talks to a geocoding upstream directly. The rollout is two
phased PRs:

1. **This PR (`M1-F03` completion):** Backend adapter targets Photon;
   `GET /api/geocode/search` and `GET /api/geocode/reverse` endpoints land
   with per-IP rate limits and Pydantic schemas. Frontend's geocoding
   provider switches to `backend` (calls our own API). `SCOUT_PHOTON_BASE_URL`
   defaults to `https://photon.komoot.io` so `make docker-up-realistic-run`
   exercises real Photon traffic without a local index build.
2. **Follow-up PR (Fly-deploy ticket):** Self-host Photon on a sibling Fly
   machine with a DC-scoped search index (built via the Nominatim → Photon
   import path documented in `infra/runbooks/photon-deploy.md`, authored
   alongside that PR). Production flips `SCOUT_PHOTON_BASE_URL` to the
   internal Fly hostname. No application code changes.

**Rationale.**
- Photon is purpose-built for autocomplete; Nominatim's own docs note
  autocomplete isn't supported by that engine. Right tool for the use case.
- Backend-proxying centralizes the rate-limit, UA, attribution, and
  (future) cache concerns where we can enforce them. Browsers cannot.
- The two-phase rollout gets us out of the TOS violation today while
  keeping the Fly-deploy work to a self-contained PR.
- The `GeocodingProvider` adapter shape from `DEC-020` is unchanged at the
  application boundary; this DEC is an engine/transport swap, not an API
  contract change. Frontend callers continue to consume `AddressHit`.

**Consequences.**
- `apps/backend/scout/clients/geocoding/nominatim.py` is removed; replaced
  by `photon.py`. Settings rename `SCOUT_NOMINATIM_*` → `SCOUT_PHOTON_*`.
  `SCOUT_GEOCODING_PROVIDER` default flips `nominatim` → `photon`.
- `apps/web/lib/providers/geocoding/nominatim.ts` is removed; replaced by
  `backend.ts` which calls `/api/geocode/*` via `lib/api.ts`. The
  `NEXT_PUBLIC_NOMINATIM_URL` env var goes away; the frontend no longer
  knows or cares what engine the backend uses.
- The new endpoints get a `geocode_get` rate-limit policy (already
  reserved in `scout/security/rate_limit.py`'s `POLICIES` table).
- Caching on the backend is intentionally **not** added in this PR;
  Photon responses are fast and the 500 ms client debounce already absorbs
  duplicate keystrokes per user. If upstream Photon becomes a bottleneck
  (concurrent unique queries across users), add a small TTL cache in a
  follow-up — the adapter is the right home for it.
- Attribution: the basemap (PMTiles / OSM) already carries the OSM
  attribution; no additional surface is required for Photon since it
  serves OSM data and Photon's own license terms inherit OSM's ODbL.
- The `OSMF Acceptable Use Policy` no longer binds Scout's geocoding
  traffic in either phase. The upstream `photon.komoot.io` "fair use"
  expectation does bind us until phase 2 lands; the soft-launch traffic
  profile is well below any reasonable fair-use ceiling.
- Closes `OQ-06` (Nominatim rate-limit handling).
- Adds a new repo guardrail (`AGENTS.md` rule #12) requiring agents to
  read and respect third-party API terms of use, and to surface
  ambiguity with emphasis. The drift this DEC corrects is the case study.

---

## DEC-023 — Geocoding: bundled DC Master Address Repository snapshot (supersedes DEC-022)

**Context.** `DEC-022` corrected the Nominatim autopilot-TOS violation by
moving traffic to Photon through the Scout backend (`DEC-020` adapter).
Empirical planner testing (`M1-F03`) showed Photon's autocomplete ranking is
still a poor fit for partial street addresses typed by disabled planners
(multi-token prefix searches like "`4818 ka`" for "`4818 Kansas`" surfaced
few or misleading hits even inside a DC bounding box — the engine favors
whole-token matches).

At the same time, the District publishes its canonical **Master Address
Repository (MAR)** under **CC0 1.0 Universal** via DC GIS FeatureServer endpoints
(details on [Open Data DC](https://opendata.dc.gov/)); citation is encouraged
but not legally required.

**Options considered.**

- **Cheap ranking tweaks atop Photon.** Low effort; does not fix the core
  tokenization mismatch for hyphenated/quadrant-heavy DC addressing.
  Rejected as the primary path.
- **Commercial global geocoder (Geoapify, Mapbox, …).** Strong matching,
  recurrent cost, ongoing TOS scrutiny, third-party exposure of typed partial
  addresses. Rejected for M1 on privacy + zero-budget posture.
- **Dedicated DC MAR snapshot in Postgres**, ingested periodically from OCTO /
  ArcGIS **`DCGIS_DATA.Location_WebMercator` layer `0`**, keyed by MAR ID —
  autocomplete becomes prefix search over authoritative city rows.
  Zero upstream calls during requests; aligns with NF-PRIV goals; CC0 clears
  licensing. Selected.

**Decision.** Scout's backend `GeocodingProvider` default implementation reads
only from Postgres table `dc_addresses` populated offline by
`scripts/ingest_dc_addresses.py` (bundled snapshot at `data/dc_addresses.jsonl`
plus repeatable `--fetch` refresh). Requests never call a remote geocoder.
The `/api/geocode/search` / `/api/geocode/reverse` JSON contracts stay what
DEC-022 shipped; adapters map rows to Scout-domain `AddressHit`.

Reverse geocode is limited to coordinates inside `DC_BBOX_LON_LAT` (matching
MAR coverage). Addresses outside MAR return `hits: []` with clear UI copy —
no silent fallback geocoder.

**Consequences.**

- `photon.py` and related `SCOUT_PHOTON_*` settings are removed. Default
  `SCOUT_GEOCODING_PROVIDER` becomes `local_dc`.
- Operational refresh is manual or scripted quarterly; tracked in
  `infra/runbooks/refresh-dc-addresses.md`.
- Fly / bandwidth risks from hosted Photon evaporate from the posture table
  (`DEC-006` lever row updated accordingly).
- `DEC-022` documented the intermediate compliant engine swap; retain it as
  history but treat `DEC-023` as authoritative for autocomplete source.

---

## DEC-PEND-* — Pending decisions

These don't block scaffolding but should be settled before M1 ships.

- **DEC-PEND-A** — Final brand / product-facing name. (See DEC-018.)
  *Status:* unchanged; revisit before M1 ships.
- **DEC-PEND-B** — Domain name and DNS provider. *Status:* deferred pending
  owner research.
- **DEC-PEND-C** — Partnership with DC disability advocacy orgs. *Status:*
  **deferred until after M1 POC ships.** Plan: build M1, then approach local
  disability advocates and chapters to invite them to use it, give feedback,
  and consider formal partnership. Disclaimer language in M1 should therefore
  be self-authored and conservative — we are speaking only for ourselves.
- **DEC-PEND-D** — Email provider for M3 magic links (Resend, Postmark,
  Mailchannels). *Status:* deferred pending owner research. Adapter pattern
  in DEC-020 means the choice is reversible.
- **DEC-PEND-E** — M1 launch venue. *Status:* **resolved.** Soft launch via
  the owner's disability community group within their activist circle. No
  blog post, no press, no social broadcast for M1. This is a friend-of-author
  beta, not a public beta. Disclaimer remains prominent but doesn't need
  liability-first hardening that a press release would warrant.

---

*End of decisions log.*
