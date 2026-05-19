# Scout — Product Requirements Document (PRD)

**Version:** 0.1 (pre-implementation) · **Owner:** [you] · **Status:** Living document

> This PRD is the source of truth for *what* Scout does. For *why* certain technical
> choices were made, see `03-decisions.md`. For the dataset shapes, see
> `appendix-data-schema.md`. For seed prompts to give downstream agents, see `prompts/`.

---

## §1. Vision

**Help partially-mobile DC residents and visitors confidently navigate the city by
showing them, before they leave home, where the accessibility obstacles and aids are
along the *exact route* they're about to take, filtered to the categories that affect
them personally.**

## §2. Goals & non-goals

### §2.1 Goals (in priority order)

1. **Reduce uncertainty before a trip.** A user should know, in under a minute, whether
   a planned walking route in DC is feasible for their specific accessibility profile.
2. **Be honest about data quality.** Every datapoint shows when it was last inspected.
   Never imply we know more than DC's data actually tells us.
3. **Be itself accessible.** The app meets WCAG 2.2 AA. Where map information would be
   visual-only, a parallel non-map view is always available.
4. **Be portable, free, and durable.** Anyone in another city should be able to fork
   Scout, swap in their city's data, and run it on a free tier.
5. **Earn local trust before expanding.** Ship to a real DC audience, get feedback,
   iterate. Worry about other cities after.

### §2.2 Non-goals

- A general-purpose mapping app or a Google Maps replacement.
- A catalog of accessible *venues* (AccessNow covers this).
- Real-time crowd/traffic/transit-arrival data.
- A native mobile app (PWA is sufficient).
- Solving DC's data freshness problem ourselves (we surface it, we don't fix it).

## §3. Personas

| ID | Persona | Description | Milestone focus |
|----|---------|-------------|-----------------|
| P1 | **Partially-mobile DC resident** | Ambulatory; walks short distances; cane/brace; may avoid sidewalks with broken curb ramps; goes to civic events. | M1 (primary) |
| P2 | **Full-time wheelchair user** | Needs guaranteed step-free routes, slope info, ramp condition. | M2 |
| P3 | **Blind/low-vision DC resident** | Needs audible signals at intersections, predictable sidewalk surfaces. | M2 |
| P4 | **Caregiver / community organizer** | Plans accessible routes on behalf of others; needs to send a shareable accessible route to attendees. | M2 |
| P5 | **Local accessibility advocate** | Wants to contribute updated information when official data is wrong. | M3 |

## §4. Glossary

- **Feature** — a single accessibility-relevant point or segment (a curb ramp, a bench, a
  restroom). Has a category, geometry, condition, and inspection year.
- **Category** — a user-facing grouping a Feature belongs to (e.g. `curb_ramps`,
  `barriers`, `restrooms`, `rest_spots`). Each category is either an obstacle category
  or an aid category.
- **Obstacle** — a Feature that *impedes* travel (broken curb ramp, sidewalk ends, pole).
- **Aid** — a Feature that *supports* travel (accessible restroom, bench, audible signal).
- **Profile** — the user's set of selected categories and preferences. Held in
  `localStorage`; never sent to the server attached to identity in M1.
- **Corridor** — the buffered area around a route's LineString within which Features
  are considered "along the route". Default 30 m, user-adjustable.
- **ORS** — OpenRouteService, our routing engine (wheelchair profile).
- **PMTiles** — single-file map tile format we use for self-hosted vector basemaps.

## §5. Key user flows

### §5.1 Flow A — *Plan a known walking route* (M1 primary)

1. User opens Scout (desktop or mobile). Lands on map view of DC.
2. First-time only: a brief, dismissible onboarding modal explains data freshness and
   asks the user to pick their accessibility preferences (Profile). Default is "all
   categories on."
3. User enters a start address and a destination address (autocomplete via Nominatim).
4. User taps "Find route."
5. Backend calls ORS wheelchair profile to get a walking route LineString.
6. Backend computes the corridor (LineString buffered by 30 m) and returns the route
   plus all Features within the corridor that match the user's Profile.
7. Frontend draws the route on the map and overlays the relevant Features (obstacles
   in warning colors, aids in supportive colors; both also indicated by shape/icon so
   color is never the only signal).
8. Frontend simultaneously renders a **parallel ordered list** of every Feature along
   the route, sorted by distance from start, with full text descriptions. This list is
   the canonical, screen-reader-friendly view.
9. User taps a Feature (map or list) to see its detail: category, condition, year
   inspected, source dataset, and freshness warning if data is older than 3 years.

### §5.2 Flow B — *Adjust preferences mid-trip* (M2)

1. User is viewing a route. Realizes they care more about benches than they thought.
2. User opens the Profile panel, toggles `rest_spots` on.
3. Features re-render on map and list without re-routing.

### §5.3 Flow C — *Share an accessible route* (M2)

1. User has a route up.
2. Taps "Share." Gets a URL that encodes both endpoints and the Profile.
3. Recipient opens the URL and sees the same route + features.

### §5.4 Flow D — *Report a feature is wrong* (M3)

1. User taps a Feature whose condition seems wrong.
2. Taps "Report correction." Picks the actual condition, optional note, submits.
3. Submission goes to moderation queue (M3 includes minimal moderation tooling).

---

## §6. Functional requirements

> Each feature ticket below is *atomic*: it has a stable ID, user value, testable
> acceptance criteria, accessibility notes referencing specific WCAG 2.2 criteria,
> dependencies, a t-shirt-size estimate, and a **prompt seed** for the
> `generate-user-stories` agent.

### Ticket template (referenced by every feature below)

```
ID:                     M{n}-F{nn}
Title:                  <short, imperative>
Persona:                P1 / P2 / P3 / P4 / P5
User value (so-that):   <what the user gets, in their voice>
Depends on:             <list of feature IDs>
Acceptance criteria:    <bulleted, testable>
Accessibility notes:    <specific WCAG 2.2 criteria + how this feature meets them>
Estimate:               XS | S | M | L
Prompt seed:            <one-paragraph hint for the user-story-generation agent>
```

### §6.1 Milestone M1 — MVP (target: ship in ~6 focused weekends)

#### M1-F01 — Public landing/about page with disclaimer
- **Persona:** P1
- **User value:** *So that I understand what Scout is, who built it, what data it uses,
  and that it's a planning aid, not a guarantee — before I start planning a real trip.*
- **Depends on:** —
- **Acceptance criteria:**
  - `/` route renders an about page with: project name, one-sentence pitch, data
    sources (with links and last-updated dates), AGPL license link, GitHub link,
    contact, and a prominent disclaimer block.
  - The disclaimer block is announced as a `<section>` with `aria-labelledby` to a
    visible "Important" heading; not stuffed in a footer.
  - Page loads without JavaScript (server-rendered).
- **Accessibility notes:** WCAG 2.2 — 1.3.1 (info & relationships), 2.4.6 (headings/labels),
  3.1.1 (language), 1.4.3 (contrast AA).
- **Estimate:** S
- **Prompt seed:** Generate stories for the public landing page including the
  disclaimer, data source attribution, and license/contact. Cover the case of a
  screen-reader user landing here first and needing to find the actual app entry.

#### M1-F02 — Map page with DC basemap
- **Persona:** P1
- **User value:** *So that I have a familiar map of DC to orient on before I do anything.*
- **Depends on:** —
- **Acceptance criteria:**
  - `/map` renders a MapLibre GL JS map centered on DC (38.9072° N, 77.0369° W) at a
    sensible zoom (z=12).
  - Basemap is a self-hosted Protomaps PMTiles file, served from the same origin as
    the app to avoid third-party tile request costs.
  - Map has visible "+/–" zoom controls that are also keyboard-operable
    (Tab-focusable, Enter/Space activate).
  - A "Skip map" link at the top of the map allows keyboard users to jump past the
    map to the controls and list view.
  - Map has `role="application"` with an explicit `aria-label` that describes it
    ("Interactive map of Washington, DC; press Tab to access controls; press M then arrow
    keys to pan").
- **Accessibility notes:** WCAG 2.2 — 2.1.1 (keyboard), 2.4.1 (bypass blocks),
  4.1.2 (name/role/value), 1.4.13 (content on hover/focus).
- **Estimate:** M
- **Prompt seed:** Generate stories for the base map page, including keyboard
  navigation, skip-link behavior, and a non-map fallback for users who prefer the
  list view by default.

#### M1-F03 — Address autocomplete (start + destination)
- **Persona:** P1
- **User value:** *So that I can quickly enter where I'm starting and where I'm going
  without knowing exact street names.*
- **Depends on:** M1-F02
- **Acceptance criteria:**
  - Two text inputs labeled "Starting point" and "Destination."
  - Autocomplete suggestions fetched from Nominatim, scoped to DC bounding box, no
    more than one request per 500 ms of typing (debounced).
  - "Use my location" button next to "Starting point" that uses the Geolocation API
    only after explicit user click (no auto-prompt on page load).
  - Suggestions are a proper ARIA combobox: `role="combobox"`, `aria-expanded`,
    `aria-controls`, `aria-activedescendant`; arrow keys navigate, Enter selects,
    Escape closes.
  - Each suggestion announces the full address and distance from user (if location
    available).
- **Accessibility notes:** WCAG 2.2 — 1.3.1, 2.1.1, 2.1.2 (no keyboard trap),
  4.1.2, 4.1.3 (status messages — announce result count).
- **Estimate:** M
- **Prompt seed:** Generate stories for the autocomplete combobox with full ARIA
  authoring practices, debouncing, optional geolocation, and respect for DC bbox.

#### M1-F04 — Walking route via OpenRouteService (wheelchair profile)
- **Persona:** P1
- **User value:** *So that I get a route that's already been optimized to avoid stairs
  and prefer wheelchair-friendly OSM ways.*
- **Depends on:** M1-F03
- **Acceptance criteria:**
  - Backend endpoint `POST /api/route` accepts `{from: [lon, lat], to: [lon, lat],
    profile: "wheelchair"}` and returns a GeoJSON FeatureCollection with the route
    LineString, total distance, total duration, and any ORS warnings.
  - Backend retries with `profile="foot-walking"` if ORS returns no wheelchair route,
    and clearly flags this fallback in the response (`fallback_profile_used: true`).
  - Endpoint caches results by rounded coordinates for 24 hours (in-memory LRU is
    fine for M1) to stay under ORS free-tier rate limits.
  - All errors mapped to user-facing strings: "No route found," "Route service is
    temporarily unavailable, please try again," etc.
- **Accessibility notes:** All error messages are text and announced via an
  `aria-live="polite"` region. WCAG 2.2 — 3.3.1, 4.1.3.
- **Estimate:** M
- **Prompt seed:** Generate stories for the routing endpoint and its fallback,
  caching, and user-facing error mapping. Include rate-limit handling.

#### M1-F05 — Render route on map + list
- **Persona:** P1
- **User value:** *So that I can see the route both visually and as text.*
- **Depends on:** M1-F04
- **Acceptance criteria:**
  - Route LineString drawn on the map with sufficient contrast against the basemap
    (≥3:1 against adjacent tiles).
  - Below the map, a "Route summary" section announces total distance, duration, and
    whether wheelchair-profile or foot-walking fallback was used.
  - On mobile, the map and the summary stack vertically; the summary is always
    above the fold.
- **Accessibility notes:** WCAG 2.2 — 1.4.11 (non-text contrast), 1.3.1.
- **Estimate:** S
- **Prompt seed:** Generate stories for route rendering across viewports and for
  the route summary's text equivalent.

#### M1-F06 — Accessibility profile selector
- **Persona:** P1
- **User value:** *So that I only see the obstacles and aids that actually affect me,
  not everything for everyone.*
- **Depends on:** —
- **Acceptance criteria:**
  - A "Preferences" panel (opens via button labeled "My accessibility needs") lists
    the available categories as checkboxes:
    - Curb ramps (obstacle if non-compliant/missing)
    - Sidewalk barriers (obstacle)
    - Audible pedestrian signals (aid when present, gap when absent)
    - Accessible bus stops (aid)
    - Accessible restrooms (aid)
    - Rest/seating spots (aid) — *data source TBD, see §10 OQ-04*
    - Water/cooling (aid) — *data source TBD, see §10 OQ-05*
  - State persists to `localStorage` (key: `scout.profile.v1`). No server call in M1.
  - Default state: all M1-available categories on.
  - Panel is a proper modal dialog: `role="dialog"`, `aria-modal="true"`,
    focus-trapped, Escape closes, focus returns to the trigger.
  - "Reset to defaults" button.
- **Accessibility notes:** WCAG 2.2 — 2.1.1, 2.1.2, 2.4.3 (focus order), 4.1.2.
- **Estimate:** M
- **Prompt seed:** Generate stories for the preferences modal: defaults,
  persistence, reset, focus trap, screen-reader announcement of state changes.

#### M1-F07 — Features along route (corridor query)
- **Persona:** P1
- **User value:** *So that I see the obstacles and aids that lie along the route I'm
  actually taking, not the whole city.*
- **Depends on:** M1-F04, M1-F06
- **Acceptance criteria:**
  - Backend endpoint `POST /api/route-features` accepts a route GeoJSON LineString,
    a buffer radius (default 30 m, max 200 m), and a list of enabled category IDs.
  - Returns a FeatureCollection of Features whose geometry intersects the buffered
    corridor and whose category is enabled.
  - Each returned Feature has the normalized shape from `appendix-data-schema.md`:
    `id, category, kind (aid|obstacle), condition, condition_normalized, inspected_year,
    source_dataset, source_id, geometry`.
  - Endpoint sorts Features by along-route distance from start.
  - Returns at most 500 Features; if more, returns the closest 500 and a warning.
- **Accessibility notes:** N/A (backend).
- **Estimate:** L
- **Prompt seed:** Generate stories for the corridor query: buffering, intersection,
  along-route distance computation, sorting, and result capping. Include performance
  budget (response time < 1 s for typical DC routes).

#### M1-F08 — Render features on map
- **Persona:** P1
- **User value:** *So that I can see at a glance where the trouble spots and helpful
  spots are along my route.*
- **Depends on:** M1-F05, M1-F07
- **Acceptance criteria:**
  - Each Feature drawn as a symbol marker on the map. Obstacles use one shape family
    (e.g., triangle), aids use another (e.g., circle). Color reinforces category but
    is never the only differentiator.
  - Markers cluster at low zoom to avoid visual overload; cluster count is announced
    on focus.
  - Tapping/focusing a marker opens a popup with the Feature's category, condition,
    inspected year, and a freshness warning if `inspected_year < current_year - 3`.
  - Markers are keyboard-focusable in along-route order.
- **Accessibility notes:** WCAG 2.2 — 1.4.1 (use of color), 2.1.1, 2.4.7
  (focus visible).
- **Estimate:** L
- **Prompt seed:** Generate stories for marker rendering, clustering, popups,
  keyboard ordering, and color-blind-safe styling.

#### M1-F09 — Parallel list view of features
- **Persona:** P1, also critical for P3 (later)
- **User value:** *So that I can read the accessibility information about my route
  without relying on a map at all.*
- **Depends on:** M1-F07
- **Acceptance criteria:**
  - Below the route summary, a `<section>` titled "Along your route" lists every
    Feature in the corridor in along-route order.
  - Each list item is a `<details>` element (closed by default for compactness)
    with summary text: "[Category icon name] [Condition] · ~[N] meters from start."
  - Expanded content shows full description, inspected year, freshness warning, and
    "Open on map" button.
  - On screens narrower than 768 px, the list is the *default* view and the map is a
    toggleable secondary view.
- **Accessibility notes:** WCAG 2.2 — 1.3.1, 1.3.2 (meaningful sequence), 2.4.10
  (section headings).
- **Estimate:** M
- **Prompt seed:** Generate stories for the parallel list view: data shape,
  along-route ordering, mobile-first layout, details/summary semantics.

#### M1-F10 — WCAG 2.2 AA conformance pass
- **Persona:** P1, P3
- **User value:** *So that the app itself doesn't become another accessibility barrier.*
- **Depends on:** all other M1-F* tickets
- **Acceptance criteria:**
  - Automated checks: `@axe-core/playwright` runs against every route and reports 0
    violations of WCAG 2.2 AA severity.
  - Manual checks: a one-page audit checklist (in `docs/a11y-checklist.md`, to be
    generated) is completed and signed off.
  - Reduced motion: respects `prefers-reduced-motion` — no animated map panning,
    no transitions over 200 ms.
  - Color contrast: all text and UI passes 4.5:1 (normal text) / 3:1 (large text /
    UI components).
  - Tested with VoiceOver (macOS), NVDA (Windows), and TalkBack (Android) at least
    once on the route-planning flow.
- **Accessibility notes:** WCAG 2.2 AA in entirety — the audit covers everything.
- **Estimate:** L
- **Prompt seed:** Generate the WCAG 2.2 AA conformance audit checklist scoped to
  Scout's MVP surface area, with each item testable and a tooling recommendation
  (axe-core, manual, screen-reader).

#### M1-F11 — Data ingestion pipeline (DC GeoJSON → PostgreSQL/PostGIS)
- **Persona:** (developer/operator)
- **User value:** *So that DC's heterogeneous datasets are queryable through one
  consistent schema, and re-running ingest is one command.*
- **Depends on:** the DB schema (DEC-019; first Alembic migration must be applied).
- **Acceptance criteria:**
  - Python script `scripts/ingest_dc.py` reads each `*.geojson` in `data/`, maps
    fields to the normalized schema (per `appendix-data-schema.md`), and upserts
    rows into the `features` table via SQLAlchemy.
  - Upsert key is `id` (`"{source_dataset}:{source_id}"`); upsert clause uses
    `ON CONFLICT (id) DO UPDATE SET ...` so re-runs are idempotent at the row
    level.
  - Mapping rules per dataset documented in `appendix-data-schema.md`, including
    the `kind`/`condition_normalized` derivation.
  - Casing normalization on the Barriers dataset's `ASSET_TYPE`.
  - Accessible Parking Zones is *not* ingested in M1 (flagged as low-quality in
    `appendix-data-schema.md`).
  - `--dry-run` flag prints counts per category/condition and exits without
    writing.
  - Script logs counts per category and per condition, plus total rows
    inserted/updated/unchanged.
  - Wraps the full ingest in a single transaction so a mid-run failure leaves
    the DB unchanged.
- **Accessibility notes:** N/A (backend).
- **Estimate:** M
- **Prompt seed:** Generate stories for the DC ingest pipeline: per-dataset
  mapping, PostgreSQL upsert, idempotency, logging, transactional safety, and
  `--dry-run` mode. Reference the schemas in `appendix-data-schema.md` and the
  DDL in §9.2.

#### M1-F12 — Backend API surface
- **Persona:** (developer)
- **User value:** *So that the frontend has a small, documented set of endpoints to
  hit.*
- **Depends on:** M1-F04, M1-F07, M1-F13
- **Acceptance criteria:**
  - FastAPI app exposes:
    - `GET  /api/health` — `{"status":"ok"}`.
    - `GET  /api/categories` — list of available categories with id, label,
      description, kind (`obstacle` | `aid`), default-enabled flag.
    - `POST /api/route` — see M1-F04.
    - `POST /api/route-features` — see M1-F07.
    - `GET  /api/restrooms?bbox=...` — see M1-F13.
  - All endpoints return JSON; all errors return a consistent `{error: {code, message}}`
    shape.
  - OpenAPI schema auto-generated at `/api/docs` (FastAPI default).
  - CORS configured to allow same-origin only by default; configurable via env var
    for development.
  - All endpoints have at least one pytest happy-path test.
- **Accessibility notes:** N/A.
- **Estimate:** M
- **Prompt seed:** Generate stories for the API endpoints, error shape, OpenAPI
  doc, CORS config, and per-endpoint tests.

#### M1-F13 — Refuge Restrooms integration (cached proxy)
- **Persona:** P1
- **User value:** *So that I can see ADA-accessible restrooms along my route, using
  community-maintained data.*
- **Depends on:** M1-F12
- **Acceptance criteria:**
  - Backend has a `restrooms` module that fetches from the Refuge Restrooms API
    filtered to DC and `ada=true`.
  - Results are cached server-side for 24 hours.
  - Restrooms are exposed through both `GET /api/restrooms?bbox=...` (for the
    standalone restroom layer) and merged into `/api/route-features` results when
    the `restrooms` category is enabled.
  - Each restroom Feature is normalized into the same schema as DC Features, with
    `source_dataset="refugerestrooms"` and `inspected_year` derived from the API's
    `updated_at` field.
- **Accessibility notes:** Restroom data may include comments — they must be rendered
  as plain text, never raw HTML, to avoid injection and to ensure screen-reader
  predictability.
- **Estimate:** M
- **Prompt seed:** Generate stories for the Refuge Restrooms integration: DC
  filtering, ADA filter, caching, normalization, and merging into corridor results.

#### M1-F14 — Mobile-responsive layout
- **Persona:** P1
- **User value:** *So that I can plan a route from my phone while I'm out, not just
  from my laptop.*
- **Depends on:** M1-F02, M1-F09
- **Acceptance criteria:**
  - App is usable at 320 px viewport width with no horizontal scroll.
  - Touch targets are ≥ 44×44 px (WCAG 2.5.5 — target size — and Apple HIG).
  - At < 768 px, the list view is primary and the map is a togglable view.
  - At ≥ 768 px, the map and list are side-by-side.
  - PWA manifest + service worker for installability, but no offline caching of
    the API in M1 (just static assets).
- **Accessibility notes:** WCAG 2.2 — 1.4.10 (reflow), 2.5.5, 1.4.4 (resize text).
- **Estimate:** M
- **Prompt seed:** Generate stories for responsive layout, touch target sizes,
  PWA installability, and the mobile-vs-desktop view toggle.

#### M1-F15 — Dockerized deployment to Fly.io (app + sibling Postgres VM)
- **Persona:** (operator)
- **User value:** *So that the app runs in one command for anyone, and deploys with
  one push.*
- **Depends on:** M1-F12
- **Acceptance criteria:**
  - Multi-stage `Dockerfile` produces a < 200 MB image with the FastAPI app +
    built Next.js standalone bundle + the PMTiles file for DC.
  - **No data baked into the app image.** The DB lives in the sibling PG VM
    (per DEC-019); the app reads via `SCOUT_DATABASE_URL`.
  - `Dockerfile.postgres` pins `postgis/postgis:16-3.4` by digest.
  - `docker-compose.yml` for local dev includes:
    - `db` (postgis, named volume `scout-pg-data`),
    - `backend` (hot-reload),
    - `web` (hot-reload),
    - and waits for `db` to be healthy before starting `backend`.
  - `fly.app.toml` for the app VM (single `shared-cpu-1x`, autostart on,
    health check on `/api/health`).
  - `fly.postgres.toml` for the PG VM (single `shared-cpu-1x`, 3 GB volume
    attached at `/var/lib/postgresql/data`, internal-only listener).
  - GitHub Actions workflow runs tests + builds the app image + deploys on
    push to `main`. PG VM is deployed manually the first time; subsequent
    schema changes go via `alembic upgrade head` run from the app on startup.
  - First-deploy runbook in `infra/runbooks/first-deploy.md`: how to bring up
    the PG VM, set the database password as a Fly secret, run initial
    Alembic migrations, run `scripts/ingest_dc.py`.
  - `README.md` updated with one-command-local-run instructions
    (`docker compose up`).
- **Accessibility notes:** N/A (ops).
- **Estimate:** M (slightly larger than the original — two Fly apps and a
  runbook)
- **Prompt seed:** Generate stories for the Dockerization, two `fly.*.toml`
  files, GitHub Actions, first-deploy runbook, and README updates. Include
  cold-start time and image size budgets. Reference DEC-019 for the PG
  topology.

---

### §6.2 Milestone M2 — Polish, share, multi-modal (~4 weekends)

#### M2-F16 — Shareable route URLs
- **Persona:** P4
- **User value:** *So I can text a friend the accessible route I planned for our
  meet-up.*
- **Depends on:** M1-F05, M1-F06
- **Acceptance criteria:** URL encodes from/to and the Profile (compact base64 of a
  JSON blob is fine); opening the URL reproduces the same route + features.
- **Accessibility notes:** Shared URLs are also keyboard-shareable via a "Copy link"
  button with an `aria-live` confirmation.
- **Estimate:** S
- **Prompt seed:** Generate stories for shareable URLs including URL schema,
  backward-compatibility plan, and copy-to-clipboard UX.

#### M2-F17 — WMATA bus stop accessibility overlay
- **Persona:** P1, P2
- **User value:** *So I can see whether the bus stops near me are step-free and
  whether the route to them is.*
- **Depends on:** M1-F11
- **Acceptance criteria:** A new category `bus_stops` sourced from the DC
  `ADA_Bus_Stop` dataset. Filterable in the Profile panel. Future-proofed for
  blending with live WMATA accessibility data (M4).
- **Accessibility notes:** Standard category accessibility.
- **Estimate:** S
- **Prompt seed:** Generate stories for the bus stop category, including
  data-quality flags.

#### M2-F18 — "Avoid steep slopes" preference (uses OSM incline tags)
- **Persona:** P2
- **User value:** *So my route avoids hills I can't safely descend.*
- **Depends on:** M1-F04
- **Acceptance criteria:** ORS request includes `restrictions: {maximum_incline: N}` for
  the wheelchair profile, where N is user-chosen (3%, 6%, 12%).
- **Accessibility notes:** Setting persists in Profile.
- **Estimate:** S
- **Prompt seed:** Generate stories for the slope-avoidance preference, ORS
  parameter mapping, and UX in the Profile panel.

#### M2-F19 — Toggle layers without re-routing
- **Persona:** P1
- **User value:** *So I can flip categories on and off in real time to compare.*
- **Depends on:** M1-F06, M1-F08, M1-F09
- **Acceptance criteria:** Toggling a category re-renders the features but does not
  trigger a new ORS call. The full Feature set within the corridor is fetched
  once and filtered client-side by category.
- **Accessibility notes:** Toggle changes are announced via `aria-live`.
- **Estimate:** S
- **Prompt seed:** Generate stories for client-side category filtering and the
  associated UX/announcement.

#### M2-F20 — Print-friendly route view
- **Persona:** P4
- **User value:** *So I can print the route + feature list and carry it.*
- **Depends on:** M1-F09
- **Acceptance criteria:** A `?print=1` URL parameter renders a black-and-white,
  ink-friendly layout: route summary + ordered feature list with addresses and
  distances. No map (most printers handle map tiles badly).
- **Accessibility notes:** Print stylesheet meets contrast minimums.
- **Estimate:** S
- **Prompt seed:** Generate stories for the print stylesheet and parameterized
  print mode.

#### M2-F21 — Alternative routes
- **Persona:** P1
- **User value:** *So if my main route is rough, I can pick a different one.*
- **Depends on:** M1-F04
- **Acceptance criteria:** ORS request asks for up to 3 alternatives. UI shows them
  as selectable tabs with a one-line summary per route (e.g., "Route 2: 200 m longer,
  3 fewer non-compliant curb ramps").
- **Accessibility notes:** Tabs follow ARIA Authoring Practices for tabs.
- **Estimate:** M
- **Prompt seed:** Generate stories for alternative-route fetching, the
  comparison summary (which requires running corridor-feature counts per alt),
  and the tab UI.

#### M2-F22 — Graceful degradation when offline or services down
- **Persona:** P1
- **User value:** *So that if I lose service mid-trip, the app doesn't blank out.*
- **Depends on:** M1-F14
- **Acceptance criteria:**
  - Service worker caches the last 3 successfully loaded routes and their features.
  - If `/api/route` fails, the user sees a clear error and an option to view the
    last cached route.
  - Static assets are precached so the shell always loads.
- **Accessibility notes:** Offline state is announced.
- **Estimate:** M
- **Prompt seed:** Generate stories for service worker caching strategy, offline
  fallback, and offline-state UX.

#### M2-F23 — Spanish localization scaffold
- **Persona:** P1 (DC demographic)
- **User value:** *So Spanish-speaking DC residents can use Scout natively.*
- **Depends on:** —
- **Acceptance criteria:** i18n library (next-intl or react-i18next) wired in, all
  user-facing strings extracted, Spanish translations stubbed (community translation
  can fill in later). Language toggle in header.
- **Accessibility notes:** `<html lang>` updates correctly.
- **Estimate:** M
- **Prompt seed:** Generate stories for i18n scaffolding, string extraction
  policy, and language toggle UX.

---

### §6.3 Milestone M3 — Accounts + user contributions (~6 weekends)

#### M3-F24 — Email magic-link accounts
- **Persona:** P5
- **User value:** *So I can sign in to submit corrections without managing a password.*
- **Depends on:** —
- **Acceptance criteria:** Account creation by email only. Magic link valid 15 min.
  Session via HttpOnly cookie. No password ever. Email never shared, never used for
  marketing.
- **Accessibility notes:** Form errors are inline and announced.
- **Estimate:** M
- **Prompt seed:** Generate stories for magic-link auth, session, account
  deletion, and privacy policy update.

#### M3-F25 — Report a feature correction
- **Persona:** P5
- **User value:** *So if DC's data says a ramp is "Good" but it's actually broken,
  I can flag it.*
- **Depends on:** M3-F24, M1-F08
- **Acceptance criteria:** From a Feature popup, "Report correction" opens a form
  with: actual condition, optional photo (M3 stretch), free-text note (sanitized),
  reporter's email derived from session. Submission enters moderation queue.
- **Accessibility notes:** Photo upload has a text-description fallback.
- **Estimate:** M
- **Prompt seed:** Generate stories for the correction form, validation, and
  submission storage.

#### M3-F26 — Submit a new feature
- **Persona:** P5
- **User value:** *So I can add the bench I saw on 14th Street that's not in any
  city dataset.*
- **Depends on:** M3-F25
- **Acceptance criteria:** Tap a point on the map → "Add a feature here" → pick
  category → fill condition + notes → submit. Moderation queue.
- **Accessibility notes:** Map-tap has a keyboard-accessible alternative ("Add
  feature by address").
- **Estimate:** M
- **Prompt seed:** Generate stories for new-feature submission including the
  keyboard alternative.

#### M3-F27 — Moderation queue + tooling
- **Persona:** (project maintainer)
- **User value:** *So I can review user submissions before they appear publicly.*
- **Depends on:** M3-F25, M3-F26
- **Acceptance criteria:** A `/admin/moderation` page (auth-gated to a hardcoded
  admin email list in M3; proper RBAC in M4) lists pending submissions with
  approve/reject/edit actions. Approved submissions enter the live data store with
  `source_dataset="user_contribution"`.
- **Accessibility notes:** Moderation UI itself meets WCAG 2.2 AA.
- **Estimate:** L
- **Prompt seed:** Generate stories for moderation queue, including the storage
  model for pending vs. approved submissions and the moderator UI.

#### M3-F28 — Saved routes per account
- **Persona:** P5
- **User value:** *So I can save a frequently used route and pull it up quickly.*
- **Depends on:** M3-F24
- **Acceptance criteria:** Up to 20 saved routes per account. Each has a user-chosen
  name. Privacy: stored encrypted-at-rest; explicit export + delete-all-data tools.
- **Accessibility notes:** Standard.
- **Estimate:** M
- **Prompt seed:** Generate stories for saved routes, list UI, and data export.

#### M3-F29 — Notify when a reported feature is acted on
- **Persona:** P5
- **User value:** *So I know my contribution mattered.*
- **Depends on:** M3-F27
- **Acceptance criteria:** Single transactional email when a submission is approved
  or rejected, with a one-click unsubscribe.
- **Accessibility notes:** Email is plain-text-first, with HTML version optional.
- **Estimate:** S
- **Prompt seed:** Generate stories for notification email, opt-out, and
  template structure.

#### M3-F30 — Postgres backup/restore + observability hardening
- **Persona:** (operator)
- **User value:** *So that user-contributed data is durable, recoverable, and
  observable now that the DB contains irreplaceable user contributions.*
- **Depends on:** M3-F25, M3-F26
- **Acceptance criteria:**
  - Nightly `pg_dump` to a Fly volume snapshot + an off-Fly destination
    (e.g., Backblaze B2 or Cloudflare R2 free tier).
  - Documented restore runbook in `infra/runbooks/postgres-restore.md`,
    with a quarterly restore drill that ops walks through.
  - Basic observability: connection-count gauge, slow-query log threshold
    set to 200 ms, alerting via Fly's built-in mechanisms or self-hosted
    Plausible-style telemetry (per DEC-006 upgrade paths).
  - Disaster-recovery RPO/RTO documented (target: RPO ≤ 24 h, RTO ≤ 4 h —
    appropriate for civic project scale).
- **Accessibility notes:** N/A (ops).
- **Estimate:** M
- **Prompt seed:** Generate stories for PG backup automation, restore
  runbook, observability hooks, and the recurring restore drill. Reference
  DEC-019 for the PG topology.

---

### §6.4 Milestone M4 — Real-time + expansion (open-ended)

> M4 is a backlog, not a sprint. Each item is independently scopeable.

- **M4-F31 — Live construction closures from DC OpenData.** Subscribe to the
  active street-closure dataset; mark affected segments along the route.
- **M4-F32 — Weather-aware routing.** Surface a banner if heavy rain or ice will
  affect non-compliant ramps along the route.
- **M4-F33 — Multi-city support.** Refactor data ingestion into a per-city
  plugin contract. Document "how to add your city" in the README.
- **M4-F34 — Crowdsourced photo verification.** Photos attached to user
  submissions go through a community verification flow.
- **M4-F35 — Public read-only API for third parties.** Versioned, rate-limited,
  documented, with a clear "you must show the disclaimer" use clause.

(Each M4 item gets the full ticket template when promoted to active.)

---

## §7. Non-functional requirements

### §7.1 Accessibility (NF-A11Y)

- **NF-A11Y-01** WCAG 2.2 Level AA in entirety. AAA where it doesn't fight UX
  (e.g., AAA 1.4.6 contrast where the design allows).
- **NF-A11Y-02** Automated `axe-core` checks gate CI. Zero AA violations.
- **NF-A11Y-03** Manual screen reader testing (VoiceOver + NVDA + TalkBack) at
  every milestone end.
- **NF-A11Y-04** `prefers-reduced-motion` respected; no auto-animating map.
- **NF-A11Y-05** Every map-conveyed datum has a non-map textual equivalent
  (the parallel list view).
- **NF-A11Y-06** Color is never the sole channel for meaning (shape + color always).
- **NF-A11Y-07** Keyboard parity: every mouse/touch action has a keyboard equivalent.
- **NF-A11Y-08** Forms have labels, error messages are programmatically associated.

### §7.2 Performance (NF-PERF)

- **NF-PERF-01** First Contentful Paint < 1.5 s on a throttled "Slow 4G" profile.
- **NF-PERF-02** Time to Interactive < 3.0 s on the same.
- **NF-PERF-03** `/api/route-features` median latency < 500 ms, p95 < 1.5 s for
  routes under 5 km.
- **NF-PERF-04** Total app payload (JS + CSS + first-paint images) < 250 KB gzipped
  for the route-planning page.
- **NF-PERF-05** PMTiles basemap < 100 MB on disk for the DC bounding box.

### §7.3 Privacy (NF-PRIV)

- **NF-PRIV-01** No tracking pixels, no third-party analytics in M1. (Plausible
  self-hosted is acceptable from M2.)
- **NF-PRIV-02** Geolocation API used only on explicit click, never auto-prompted.
- **NF-PRIV-03** Profile state stored in `localStorage` only in M1; never sent to
  the server keyed to identity.
- **NF-PRIV-04** Server logs scrub IP addresses after 7 days.
- **NF-PRIV-05** Privacy policy lives at `/privacy`; written in plain English.
- **NF-PRIV-06** In M3+, accounts can be deleted with one click; deletion is
  fully cascading.

### §7.4 Liability and trust (NF-TRUST)

- **NF-TRUST-01** A short disclaimer is present on the landing page and as a
  collapsed-but-visible banner on the route view: "Scout is a planning aid based
  on public data, some of which is years old. Always plan a fallback. Scout's
  maintainers are not responsible for trip outcomes."
- **NF-TRUST-02** Every Feature shows its `inspected_year`. Features older than
  3 years show a `Data may be outdated` warning.
- **NF-TRUST-03** Source attribution links from every Feature back to its
  originating DC OpenData record.
- **NF-TRUST-04** No claim of completeness — explicitly acknowledge that absence
  of a Feature in the data is not absence in reality.

### §7.5 Open-source & community health (NF-OSS)

- **NF-OSS-01** License: AGPL-3.0. `LICENSE` file present.
- **NF-OSS-02** ~~`CONTRIBUTING.md` explains how to set up the dev env, run tests,
  and submit a PR.~~ **DONE** — see `CONTRIBUTING.md`.
- **NF-OSS-03** `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- **NF-OSS-04** Issue templates for "Data is wrong about a place" (links to M3
  flow when shipped) and "Found a bug."
- **NF-OSS-05** Public roadmap (this PRD) linked from the README.
- **NF-OSS-06** All accessibility decisions documented and reviewable.

---

## §8. Technical architecture (high level)

> Rationale for each choice is in `03-decisions.md`. This section is the *shape*,
> not the *why*.

```
┌──────────────────────────────────────────────────────────────────┐
│                          Browser (PWA)                           │
│  Next.js 15 (App Router) · TypeScript · Tailwind · MapLibre GL   │
└──────────────────────────────────────────────────────────────────┘
                  │                          │
                  │ (1) Tile requests        │ (2) JSON API
                  ▼                          ▼
┌──────────────────────────────┐  ┌──────────────────────────────┐
│   Static PMTiles (DC bbox)   │  │      FastAPI backend         │
│   Self-hosted, served by     │  │      Python 3.12, uv         │
│   the same container as the  │  │      SQLAlchemy 2 + GeoAlchemy2│
│   API (or a CDN if budget    │  │      Pydantic v2             │
│   allows).                   │  │                              │
└──────────────────────────────┘  │   /api/health                │
                                  │   /api/categories            │
                                  │   /api/route                 │
                                  │   /api/route-features        │
                                  │   /api/restrooms             │
                                  └──────────────────────────────┘
                                       │       │       │
                          (3) Routing  │       │       │ (4) Restrooms
                                       ▼       │       ▼
                          ┌────────────────────┐│┌───────────────────────┐
                          │ OpenRouteService   │││ Refuge Restrooms API  │
                          │ (public API in M1) │││ (DC-filtered, ADA,    │
                          │ via routing adapter│││  24h cache, via       │
                          │ (DEC-020)          │││  restrooms adapter)   │
                          └────────────────────┘│└───────────────────────┘
                                                │
                                  (5) Spatial SQL via SQLAlchemy + GeoAlchemy2
                                                ▼
                              ┌─────────────────────────────────┐
                              │ PostgreSQL 16 + PostGIS 3.x      │
                              │ Self-hosted in a sibling Fly VM │
                              │ (`scout-pg.internal:5432`)      │
                              │ 3 GB Fly volume; private network│
                              │ Single `features` table in M1;  │
                              │ M3 adds submissions, accounts.  │
                              └─────────────────────────────────┘
```

**Repo layout (proposed):**

```
scout/
├── apps/
│   ├── backend/         FastAPI app
│   │   ├── scout/
│   │   ├── alembic/     migrations (DEC-019)
│   │   ├── alembic.ini
│   │   ├── tests/
│   │   └── pyproject.toml
│   └── web/             Next.js app
│       ├── app/
│       ├── components/
│       ├── design/      design tokens (DEC-015 → prompts/07)
│       ├── lib/
│       └── package.json
├── data/                source GeoJSONs (current top-level *.geojson move here)
├── scripts/             ingest_dc.py, build_pmtiles.sh
├── infra/
│   ├── Dockerfile           app image (FastAPI + Next.js)
│   ├── Dockerfile.postgres  PostGIS image (pinned)
│   ├── docker-compose.yml   dev: app + web + postgis
│   ├── fly.app.toml         deploys the app
│   ├── fly.postgres.toml    deploys the sibling PG VM
│   └── runbooks/            ops runbooks (per DEC-006)
├── docs/                this folder
├── .github/workflows/   ci.yml, deploy.yml
├── LICENSE              AGPL-3.0
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
└── README.md
```

## §9. Data model (normalized)

Full per-dataset mapping rules are in `appendix-data-schema.md`. The runtime
store is PostgreSQL + PostGIS (per DEC-019). M1 has a single `features` table;
M3 adds tables for user submissions, moderation queue, and accounts.

### §9.1 API contract (JSON shape)

```jsonc
{
  "id": "dc_ada_curb_ramp:ADA_CurbRampPt_1",      // stable across re-ingests
  "category": "curb_ramps",                       // see /api/categories
  "kind": "obstacle",                             // or "aid"
  "condition": "Non-Compliant",                   // raw source value
  "condition_normalized": "blocking",             // blocking | difficult | mild | good | missing | present | absent | n_a
  "inspected_year": 2016,
  "source_dataset": "dc_ada_curb_ramp",
  "source_id": "ADA_CurbRampPt_1",
  "geometry": { "type": "Point", "coordinates": [lon, lat] },
  "attributes": {                                 // category-specific extras
    "estimated_year_of_improvement": 2030
  }
}
```

### §9.2 DDL (M1)

Authoritative version lives in the first Alembic migration; this is for
reviewer reference.

```sql
CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE features (
    id                    text        PRIMARY KEY,
    category              text        NOT NULL,
    kind                  text        NOT NULL,
    condition             text,
    condition_normalized  text        NOT NULL,
    inspected_year        smallint,
    source_dataset        text        NOT NULL,
    source_id             text        NOT NULL,
    attributes            jsonb       NOT NULL DEFAULT '{}',
    geom                  geography(Point, 4326) NOT NULL,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX features_geom_idx       ON features USING GIST (geom);
CREATE INDEX features_category_idx   ON features (category);
CREATE INDEX features_source_idx     ON features (source_dataset);
```

### §9.3 Corridor query (M1)

The implementation of `/api/route-features` (M1-F07) reduces to:

```sql
SELECT *,
       ST_Distance(geom, ST_StartPoint(:line)::geography) AS along_route_m
FROM   features
WHERE  category = ANY(:enabled_categories)
  AND  ST_DWithin(geom, :line::geography, :buffer_m)
ORDER  BY along_route_m
LIMIT  500;
```

(`ST_LineSubstring` and `ST_LineLocatePoint` provide a more accurate
along-route distance than `ST_Distance` from start; refine during
implementation.)

## §10. Open questions

Each open question gets a stable ID (`OQ-NN`) so downstream agents and PRs can
reference it.

- **OQ-01** ~~SQLite + Spatialite vs. in-memory shapely?~~ **RESOLVED** by
  DEC-019: PostgreSQL + PostGIS from M1, self-hosted in a sibling Fly VM.
- **OQ-02** ~~Bake data file into the Docker image vs. mount as a volume?~~
  **RESOLVED** by DEC-019: data lives in the sibling PG VM, not in the app
  image. App image carries only code + Alembic migrations + PMTiles.
- **OQ-03** Where do we host PMTiles? Same container? Separate static bucket?
  **Default: same container** for M1 (zero-budget). Move to R2/Backblaze if
  bandwidth ever becomes an issue.
- **OQ-04** "Rest/seating spots" data source — DC doesn't publish a comprehensive
  bench dataset. **Options:** (a) OSM `amenity=bench` via Overpass, ingest
  alongside DC data; (b) defer to M3 and rely entirely on user submissions;
  (c) launch without this category and add later. **Recommendation:** option (a)
  for M1 — OSM bench data in DC is decent.
- **OQ-05** "Water/cooling" data source — same situation. OSM has
  `amenity=drinking_water`. DC has a public cooling center dataset that's
  seasonal. **Recommendation:** OSM `drinking_water` for M1; add seasonal cooling
  centers in M2 when summer matters.
- **OQ-06** Address autocomplete — Nominatim's usage policy requires < 1 req/sec
  per server. **Action:** debounce 500 ms client-side AND rate-limit server-side;
  pre-load DC street centerlines as a local fallback.
- **OQ-07** Liability: should the disclaimer be a click-through ("I understand")
  before first use, or just always-visible? **Recommendation:** always-visible
  banner + a one-time onboarding modal. No click-through gates feel patronizing.
- **OQ-08** Color palette must be color-blind-safe AND high-contrast. We need a
  designer pass or use a vetted palette. **Recommendation:** start with
  IBM's color-blind-safe palette; commission a designer in M2.
- **OQ-09** Restroom data licensing — Refuge Restrooms is CC0; we're fine. But
  user-contributed data in M3 needs an explicit license. **Recommendation:** ODbL
  (same as OSM) so contributions can flow back upstream where appropriate.
- **OQ-10** ORS public API rate limit (~2000 req/day). At what usage do we
  self-host? **Action:** instrument from day one; alert when daily count
  > 1500.
- **OQ-11** Logging/observability — Fly.io's free tier gives basic logs. Do we
  need more? **Recommendation:** none in M1; add Plausible (self-hosted) in M2.
- **OQ-12** PWA offline scope — caching the SPA shell is easy; caching tiles for
  a user's neighborhood is harder. **Recommendation:** SPA shell only in M1;
  per-neighborhood tile caching in M2 if requested.
- **OQ-13** **Project Sidewalk DC** (University of Washington research project) has
  250,000+ crowdsourced sidewalk accessibility labels across ~1,075 miles of DC
  streets — meaningfully richer than DC's own ADA datasets. They publish a public
  GeoJSON API. **Options:** (a) ignore for M1, ship with DC OpenData only;
  (b) blend Project Sidewalk data into M1 alongside DC OpenData under a new
  `source_dataset="project_sidewalk_dc"`; (c) defer to M2, reach out to the
  research team first to confirm fair-use and attribution expectations.
  **Recommendation:** option (c). The DC OpenData alone is enough to validate M1
  with users; bringing in a partner dataset properly is a M2 conversation. Block
  any speculative ingestion until we've talked to UW.

## §11. Risks

| ID | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | DC data is too stale to be trusted | High | High | NF-TRUST-02 freshness UX; M3 user corrections |
| R2 | ORS rate limit blocks production usage | Medium | High | OQ-10 instrumentation; self-host fallback documented |
| R3 | Solo-dev burnout | High | Critical | Ruthless M1 scoping; each milestone ship-able solo |
| R4 | A11y debt accumulates and is never caught up | Medium | High | M1-F10 forces a real audit before MVP ships |
| R5 | Liability incident: user follows a "good" route, gets stranded | Low | Critical | NF-TRUST-01, NF-TRUST-02, NF-TRUST-04 |
| R6 | Project gets cloned + closed-sourced | Medium | Medium | AGPL-3.0 |
| R7 | Restroom API goes down | Low | Medium | M1-F13 caching; fall back to last-known on error |
| R8 | OSM tiles licensing/cost surprise | Low | Medium | PMTiles self-hosted; no tile API calls |

## §12. Out-of-scope decisions to revisit later

- Native mobile apps. (PWA only.)
- Real-time turn-by-turn navigation. (Pre-trip planning only.)
- Voice interface. (Maybe M4.)
- Apple Maps / Google Maps embedding for users who prefer them. (No — we explicitly
  chose OSM for accessibility data quality.)

---

*End of PRD.*
