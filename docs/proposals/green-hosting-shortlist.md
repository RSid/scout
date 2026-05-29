# Proposal (research record): green hosting shortlist for Scout

**Status:** Research record, **not binding**. Companion to `DEC-025`
(host-neutral container deploy). This document preserves the hosting evaluation
so that picking a concrete provider later is an informed, one-runbook change.
It does **not** select a provider; `DEC-025` deliberately defers that.

**Last reviewed:** 2026-05-29.

---

## 1. Constraints (owner-stated)

In the owner's priority order, as clarified during the evaluation:

1. **Cheap or free first.** No budget until there are users; some willingness to
   pay a little more specifically for green hosting.
2. **Easy, user-friendly deploys.**
3. **Green hosting is a tiebreaker** — preferred and preserved, but not a gate
   for M1. Greenest option _among those that already qualify on cost + ease_.
4. **Must support the stack:** a Dockerized FastAPI API + Next.js standalone
   server (single image, single `$PORT` after `DEC-025`) and a
   PostgreSQL 16 + PostGIS database.
5. **Portability / vendor-agnostic** so the host can change without a rename or
   refactor. (Satisfied structurally by `DEC-025`.)

The app is **DC-only** and the M1 launch is a friend-of-author soft launch
(`DEC-PEND-E`), so traffic is low and US-East latency is ideal but not critical.

## 2. The green-hosting finding that shaped this

"Green-verified" here means **listed in the
[Green Web Foundation (GWF) directory](https://app.greenweb.org/directory/)**,
which verifies renewable/fossil-free energy evidence annually.

- The GWF **VPS** US list (`?services=2`) is useful. It includes
  **Google Cloud** (GWF-verified, offers VPS / block storage / PaaS) plus indie
  green hosts that can run a container: **Brownrice** (New Mexico on-site solar),
  **Viridio** (solar VPS + PaaS), **Sustainable Hosting** (carbon-_negative_;
  offers free hosting to good causes that can't pay), **Opus Interactive**, and
  **HostJane** (AWS-backed).
- **Render, Railway, Fly.io, and Koyeb are _not_ in the GWF directory** as of
  this review. They may run on renewable-matched clouds (AWS/GCP) but cannot be
  cited as GWF-verified green.
- **Hetzner is GWF-verified green — but only for its EU data centers**
  (owned hydropower in Germany/Finland). Its **US sites (Ashburn, Hillsboro)
  are colocation and are _not_ covered** by that verification, so "green +
  Hetzner" implies an EU region for a US app.

## 3. Portability finding (why provider choice is low-stakes)

A code audit found **no hard Fly lock-in**:

- The runtime image reads `SCOUT_DATABASE_URL` and all secrets from the
  environment (`apps/backend/scout/config.py`).
- External services sit behind the `DEC-020` adapter layer.
- The rate limiter's trusted-proxy header is **configurable**
  (`SCOUT_CLIENT_IP_HEADER`, default `X-Forwarded-For`; the `Fly-Client-IP`
  appearance in `apps/backend/tests/test_rate_limit.py` is one parametrized
  example beside `Cf-Connecting-IP`, not a hardcoding).

The only structural coupling was the two-process image needing an external
reverse proxy. `DEC-025` removes that by bundling Caddy in the image behind a
single `$PORT`. After that, every candidate below is "push one container + point
at one Postgres".

## 4. Options, ranked

Confidence = the reviewer's estimate that the option is a good fit for the
constraints above, at this review date. Verify live pricing/free-tier terms at
sign-up; provider terms change.

### Managed-PaaS path (push-to-deploy)

#### A. Google Cloud — Cloud Run (app) + Cloud SQL for PostgreSQL/PostGIS — ~80%

- **Pros:** GWF-verified green (greenest hyperscaler; 100% annual renewable
  matching, 24/7 carbon-free-energy roadmap); `us-east4` (N. Virginia) is
  ~on top of DC; container-native (deploys the Dockerfile); Cloud Run scales to
  zero (app tier near-free at soft-launch traffic); Postgres stays standard
  behind `SCOUT_DATABASE_URL`; reputable uptime.
- **Cons:** Cloud SQL has **no free tier** (~$9–10/mo smallest instance) —
  acceptable given the "pay a bit for green" allowance; GCP setup/IAM heavier
  than Render; **billing-surprise risk** (set a hard budget cap); Cloud Run
  wants one port (satisfied by the `DEC-025` Caddy-in-image change).

#### B. Render (Railway is a near-equivalent) — ~75%

- **Pros:** Easiest push-to-deploy; Docker + `render.yaml` blueprint; managed
  Postgres supports the **PostGIS** extension; cheap (~$7 web + ~$7 db ≈ $14/mo,
  or free with cold-starts/limits); good portability (Dockerfile + a throwaway
  blueprint).
- **Cons:** **Not GWF-verified** — green only indirectly (runs on AWS/GCP; pick
  a low-carbon region like Oregon), so it loses the green tiebreaker; free
  Postgres is time-limited; free web service spins down (cold starts).

### VPS path (single box: Docker Compose + the in-image Caddy + self-hosted PostGIS)

#### C. Indie green VPS — Sustainable Hosting / Brownrice / Viridio — ~60%

- **Pros:** Best green story (on-site solar / carbon-negative) and best ethos
  fit for an AGPL civic-accessibility project; US-based; cheapest-to-free
  (**Sustainable Hosting may donate hosting** to qualifying causes — worth a
  direct email); maximum portability (just Docker on Linux).
- **Cons:** Small providers → less-proven uptime/support; light-to-moderate ops
  (patching, TLS, Postgres backups); pricing/specs less transparent
  (sales conversation); no slick CI deploy hook.

#### D. Hetzner Cloud (EU regions) — ~55%

- **Pros:** GWF-verified green (owned hydropower, EMAS-certified); rock-bottom
  price (~€4–5/mo for 2 vCPU/4 GB); excellent tooling; full Docker; max
  portability.
- **Cons:** Green verification covers **EU only** — US sites are colocation and
  not green-verified, so staying green means hosting in Germany/Finland →
  ~90–110 ms transatlantic latency for a DC-only app (tolerable for cached
  tiles + a non-chatty API, but a real downgrade); light ops.

### Status quo, for reference

#### E. Fly.io — ~50%

- Technically fine (container-native; `iad` is near DC; very cheap with
  auto-stop), but **not GWF-verified** and the owner has chosen to move off it.
  Included only for comparison.

## 5. Recommendation (when a host is chosen)

- **If the green tiebreaker should bite and a small spend is OK:** **Google
  Cloud (A)** — the only choice satisfying verified-green + reputable + near-DC +
  container-native.
- **If minimizing cost/ops dominates and green is truly optional:** **Render
  (B)** — fastest path to a running deploy; just don't claim GWF-verified-green.
- **If green ethos + civic alignment matter most and light VPS ops are fine:**
  **indie green VPS (C)** — start by emailing **Sustainable Hosting** about their
  free-for-good-causes offer (Scout is squarely their target).

## 6. Third-party TOS review (AGENTS.md rule #12) — TO COMPLETE AT SELECTION

Before production cutover on whichever host is chosen, read and record:

- [ ] The provider's acceptable-use policy / terms of service (link + date).
- [ ] Any clause affecting a public, free, accessibility-data app for disabled
      users (rate caps, resource limits, content/redistribution terms).
- [ ] Confirmation that bundled/redistributed data (OSM/ODbL tiles via PMTiles,
      DC MAR under CC0, Refuge Restrooms) is compatible with the host's terms.
- [ ] If green is claimed in user-facing copy, the basis (GWF listing or the
      provider's own evidence) and its review date.

Record the outcome here and in the implementing PR under a
"Third-party TOS review" heading.
