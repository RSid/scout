# Scout — one-pager

**Status:** Pre-MVP planning · **Owner:** [you] · **Last updated:** 2026-05-19

## What it is

Scout is an open-source, mobile-and-desktop web app that lets people with mobility-related
accessibility needs plan walking routes in Washington, DC and see, *along the route they're
about to take*, where they'll encounter accessibility obstacles (broken curb ramps, sidewalk
gaps, missing audible signals) and accessibility aids (accessible restrooms, benches, water
fountains, accessible bus stops). Users pick which categories matter to them *before* they
search, so the map shows only the information that affects their specific needs.

## Why it matters

DC publishes detailed ADA-compliance datasets, but they're inert — buried in OpenData portals
in formats no resident actually uses to plan a trip. For a partially-mobile user trying to
attend a protest, an organizing meeting, a doctor's appointment, or a friend's apartment,
the gap between "I can walk a few blocks" and "I can survive *these* few blocks" is
everything.

## Where Scout fits in the existing landscape

There's an active ecosystem of accessibility tools, but every one of them does
something different from what Scout does. The gap is real.

| Tool | Focus | What it doesn't do |
|---|---|---|
| **AccessNow** | Crowdsourced ratings of *venues* (restaurants, shops, parks) | Routing; path-level info |
| **Wheelmap** | OSM-based traffic-light ratings of *venues* worldwide | Routing; depth beyond a single tag |
| **AXS Map** | Crowdsourced *venue* ratings, NYC-focused | Routing; coverage outside NYC |
| **ROLLIN** | Paid app: 6-feature *venue* scores across ~15 states | Routing; path-level info; free access |
| **AbleVu** | Paid ($299/yr) venue catalog for ~8 cities | Routing; affordability; DC |
| **Citymapper** | Wheelchair-aware *transit* routing in select metros | Walking routes; non-transit context |
| **Google Maps** | A binary "wheelchair accessible" tag on some places | Path-level info; verification; trust |
| **Project Sidewalk** | UW research project crowdsourcing *sidewalk labels* (250,000+ in DC) | Consumer-facing routing; a product to *use* the data |

**The gap Scout fills:** walking-route planning where the user sees the
obstacles and aids *along the path they're about to walk*, in the city they live in,
filtered to the categories that affect them personally — using both official city
data and richer crowdsourced sources where available.

Project Sidewalk in particular is a candidate *upstream data source* for Scout, not
a competitor; their DC labels are richer than DC's official datasets and they
publish a GeoJSON API. We track this as `OQ-13` in the PRD.

Concrete picture of the problem, from the DC datasets themselves:

- **~60% of mapped curb ramps in DC are Non-Compliant or Missing** (20,024 of 34,859).
- **~80% of mapped intersections lack audible pedestrian signals** (6,304 of 7,823).
- ~13,000 documented barriers in the public right-of-way (sidewalk ends, vertical
  displacements, poles obstructing the path).

These aren't edge cases. They're the median DC block.

## Who it's for

Primary persona (MVP target): **the partially-mobile DC resident.** Ambulatory, can walk
short distances, may use a cane, brace, or occasional wheelchair. Self-routes on foot today
and gets blindsided by curb cuts that don't exist, sidewalks that end, and intersections
that aren't safe to cross. Often going to civic events, organizing meetings, or
appointments where they can't just "skip it if it's too hard."

Secondary personas (later milestones): full-time wheelchair users; blind or low-vision DC
residents; caregivers planning a route for someone else; visitors to DC.

## What's in scope for M1 (MVP)

- A-to-B walking route between two DC addresses, using a wheelchair-aware routing engine
  (OpenRouteService) over OpenStreetMap data.
- Pre-search **accessibility preferences**: user selects which categories of features
  matter to them before searching (mobility obstacles, accessible restrooms, rest spots,
  water/cooling).
- **Route view** with the route line plus the relevant DC obstacles/aids drawn along it,
  with a configurable buffer (default 30 m).
- **WCAG 2.2 AA** conformance for the app itself: keyboard navigable, screen-reader
  accessible, sufficient color contrast, respects reduced-motion preferences, no map-only
  information (every visual cue has a text equivalent in a parallel list view).
- Mobile-first responsive design, also usable on desktop.
- **Liability-clear UX**: data freshness (year of inspection) shown on every feature;
  prominent disclaimer that this is a planning aid, not a guarantee.

## What is explicitly NOT in M1

- User accounts, login, saved routes, user-uploaded data — all M3.
- Transit, driving, parking routing — M2 at earliest.
- Real-time data (construction, closures, weather) — M4.
- Cities other than DC — post-M4.
- Crowdsourced data corrections and moderation — M3.
- Native mobile apps — never planned; PWA only.

## Success criteria

- **Functional**: at least 10 partial-mobility DC residents successfully use Scout to plan
  a real trip and report it was more useful than Google Maps for that trip.
- **Accessibility self-test**: Scout passes automated axe-core checks on all routes, and
  passes a manual WCAG 2.2 AA audit against the conformance checklist.
- **Data honesty**: every feature on the map shows its inspection year; users can see at
  a glance that DC's data is mostly 2016 and decide for themselves what to trust.
- **Open-source health**: code, data ingestion scripts, and a "how to add your own
  city" guide are public under AGPL-3.0.

## Voice & user-facing copy

- Write for partially-mobile DC residents — clear, respectful, jargon-light.
- On marketing-style and policy pages, avoid product or engine names unless they help
  comprehension. **Technical partners and stacks** belong on the **`/about` About Scout page**
  for transparency (with links): geocoders, routers, attribution. **Privacy** should
  describe flows in plain terms and defer the proper-name rundown to About.
- Implementation detail for contributors: **`apps/web/AGENTS.md`** expands this rule for TS/React work.

## Constraints

- **Zero budget.** Hosting on Fly.io free tier; tiles via self-hosted Protomaps; routing
  via OpenRouteService public API (with self-hosting as a documented fallback).
- **Solo developer.** Scope must be ruthlessly small at each milestone.
- **AGPL-3.0** licensed to prevent closed-source forks of a civic-good project.

## Risks at a glance

1. **Stale DC data (mostly 2016)** — addressed by transparency, not by fixing the data.
2. **OpenRouteService rate limits** — fallback to self-hosted ORS if exceeded.
3. **Liability if a route is wrong** — addressed via disclaimer + freshness UX.
4. **Solo-dev burnout** — addressed by hard milestone scoping and shippable M1 in
   ~6 weekends, not 6 months.

See `docs/02-prd.md` for the full PRD and `docs/03-decisions.md` for the rationale
behind every major technical and product choice.
