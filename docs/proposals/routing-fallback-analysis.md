# Routing Fallback Analysis

**Date:** 2026-07-25
**Context:** ORS deprecated `api.openrouteservice.org` in favor of
`api.heigit.org/openrouteservice` (April 2026). During the migration both
endpoints experienced outages due to HeiGIT internal DNS failures. This
analysis evaluates fallback options for future ORS downtime, grounded in
Scout's accessibility mission, zero-budget constraint, vendor-adapter
architecture (DEC-020), and privacy requirements.

---

## Option A: Self-host ORS in Docker (alongside Scout)

Run the ORS engine on the Hetzner box, pointed at a DC-region OSM extract.
Use it as a second `RoutingProvider` adapter or replace the hosted API entirely.

**Tradeoffs:**

- (+) Same wheelchair profile, same API format -- adapter barely changes
- (+) Zero vendor dependency, no rate limits, no surprise deprecations
- (+) DC-only extract is tiny (~50 MB PBF, ~1 GB RAM), fits on the existing box
- (+) Aligns with DEC-020 (vendor portability), DEC-023 (bundle your own data),
  and the privacy stance (no client IPs leaking to third parties)
- (-) Ops burden: OSM data freshness, graph rebuilds, memory overhead
- (-) Solo-maintainer burden -- another container to monitor
- (-) Graph rebuild takes minutes and needs a second instance to avoid downtime

**Confidence: 85%.** The right long-term move. Only option that preserves the
wheelchair profile *and* eliminates the single-point-of-failure. DC-only
extract keeps resource requirements minimal.

---

## Option B: Dual-provider failover (hosted + self-hosted ORS)

Keep `api.heigit.org/openrouteservice` as primary. Add a self-hosted ORS
instance as fallback. The adapter tries primary first; on timeout/5xx, retries
against localhost.

**Tradeoffs:**

- (+) Best availability -- survives both HeiGIT outages and local reboots
- (+) Incremental path from today
- (-) Two ORS instances to maintain, two sets of OSM data to keep in sync
- (-) More adapter complexity (retry logic, circuit breaker)
- (-) Over-engineered for a solo-maintained civic project

**Confidence: 50%.** Technically sound but violates the "ruthless scoping"
principle.

---

## Option C: OSRM with community wheelchair profile as fallback

Add OSRM as a second `RoutingProvider` behind the existing adapter protocol.
When ORS is down, fall through to OSRM.

**Tradeoffs:**

- (+) Extremely lightweight and fast (C++, <200 MB for DC)
- (+) Self-hostable, open source, different failure domain
- (-) Wheelchair profile is community-maintained, less mature than ORS
- (-) Different response format -- needs a new adapter
- (-) Wheelchair routing quality is meaningfully worse (no `incline`, limited
  `kerb` handling), which matters for M2-F18 slope avoidance
- (-) Falling back to a less capable wheelchair profile without telling the user
  undermines the honesty-about-limits principle

**Confidence: 35%.** The wheelchair profile gap is the dealbreaker.

---

## Option D: Graceful degraded experience (no route, scoped features)

When ORS is down, skip the route line. Zoom the map to encompass both start
and end points, and show all accessibility features within the visible bounds
(rather than along a corridor). Clear copy explains the degradation.

**Tradeoffs:**

- (+) Zero infrastructure to maintain
- (+) Honest about limits (voice-and-copy principle)
- (+) Users still get the unique value prop -- the accessibility feature overlay
- (-) Features shown are area-scoped, not corridor-scoped, so less precise
- (-) No distance/time estimates

**Confidence: 70%.** A good interim UX that preserves the core value prop
while being honest about what is and isn't available.

---

## Recommendation

**Option A (self-host ORS) for the medium term; Option D for the immediate
term.**

1. **Now:** Merge the URL fix. Implement Option D so ORS downtime still shows
   useful feature data.
2. **Soon:** Add a smoke test to `make release` that curls the ORS endpoint
   before tagging.
3. **M2 or a quiet week:** Self-host ORS with the DC OSM extract. One more
   service in `docker-compose.prod.yml`, swap the base URL to localhost, drop
   the API key dependency entirely.
