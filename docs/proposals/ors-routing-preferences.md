# ORS Wheelchair Routing Preferences — What's Available

## Current state

Scout requests routes from OpenRouteService (ORS) using the `wheelchair` profile, with no additional parameters. If wheelchair routing fails for a given route, it silently falls back to `foot-walking`. Users have no control over routing behavior.

Relevant code: `apps/backend/scout/clients/routing/openrouteservice.py`

## What ORS supports that we don't use yet

The ORS wheelchair profile accepts a `restrictions` object that lets callers tune routing to individual mobility needs. These are sent as part of the request payload under `options.profile_params.restrictions`.

### Available parameters

| Parameter | Type | Description | Example values |
|-----------|------|-------------|----------------|
| `maximum_incline` | int (%) | Steepest slope the router will consider. Segments above this are avoided. | 3, 6, 10, 15 (default: 6) |
| `maximum_sloped_kerb` | float (m) | Tallest curb the router will cross. Lower = smoother transitions. | 0.03, 0.06, 0.1 (default: 0.06) |
| `minimum_width` | float (m) | Narrowest path the router will use. Wider = avoids tight sidewalks. | 1.5, 2.0, 2.5 (default: 1.5) |
| `surface_type` | string | Worst acceptable surface. Options from smoothest to roughest: `concrete`, `asphalt`, `paving_stones`, `compacted`, `cobblestone:flattened`, `cobblestone`, `gravel`, `unpaved`. Setting e.g. `compacted` allows that and all smoother surfaces. | `asphalt`, `compacted`, `cobblestone` |
| `smoothness_type` | string | Minimum smoothness. Options from best to worst: `excellent`, `good`, `intermediate`, `bad`, `very_bad`, `horrible`. | `good`, `intermediate` |

### What this means for users

Different wheelchair users have very different needs:

- A **power wheelchair** user may handle 10–15% inclines but needs minimum 0.8m width
- A **manual wheelchair** user may need inclines under 6% but can navigate narrower paths
- A **walker/rollator** user may tolerate rough surfaces but not steep curbs
- A **parent with a stroller** (secondary audience) mostly cares about curb cuts and surface

Today all these users get identical routes. Exposing even one or two of these parameters would make routing meaningfully more personal.

### What the data depends on

These parameters only work where OSM mappers have tagged the relevant attributes (`incline`, `kerb`, `surface`, `width`, `smoothness`). In Washington DC, coverage varies — main sidewalks tend to have surface and kerb data, but incline and width are spottier. Taginfo registration (issue #80) will help signal to mappers that this data matters.

## Implementation complexity

**Low.** The backend change is small — add the restrictions dict to the ORS request payload and include user preferences in the cache key. The real work is in product/design: deciding which parameters to expose, how to present them, sensible defaults, and whether preferences persist per-user or per-session.

## Open questions for product/design

1. Which parameters matter most to our users? (Incline and surface type are probably highest impact.)
2. Should these be a one-time profile setup, or adjustable per-trip?
3. What's the right UX — sliders, presets ("power chair" / "manual chair" / "walker"), or both?
4. How do we handle routes where restricted routing fails? (Today we fall back to foot-walking silently — should we tell the user why?)
5. Should we show *why* a route was chosen? ("This route avoids a 12% grade on M St.")
