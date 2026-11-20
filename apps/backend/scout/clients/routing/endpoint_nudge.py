"""Plan a wheelchair retry when an endpoint only connects by steps (M1-F04).

Why this exists: ORS's wheelchair graph drops ``highway=steps`` at build time.
When a start or destination snaps onto a footpath "island" (inside Union
Station, the Capitol grounds, Dupont Circle, …) whose only link to the street
is a staircase, ORS answers "route could not be found" (error 2009) even
though almost the whole trip is step-free. In a 20-trip DC sample, 8 trips
failed this way and all 8 succeeded once the stuck endpoint was moved
55–147 m along the foot-walking route onto the street.

So, after the foot-walking fallback succeeds, we use it to pick nearby
endpoints and try wheelchair once more between them. The stretches we skip
are reported as unverified, never hidden.

Everything here is pure: no I/O, no clock, no logging.
"""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Literal

from scout.clients.routing.types import RoutingComputation, UnverifiedSegment
from scout.geo import LonLat, point_at_distance, slice_line

STEPS_WAYTYPE = 8
"""ORS ``waytype`` extra-info value for Steps.

https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/waytype
"""

STEP_SEARCH_RADIUS_M = 200.0
"""Steps that start within this distance of an endpoint are treated as the
endpoint's step-only connection. The research sample found the steps
6–174 m from the stuck end."""

STEP_CLEARANCE_M = 20.0
"""How far past the last nearby step to place the new endpoint, so ORS snaps
it to the street below the steps rather than back onto the island."""

DEFAULT_NUDGE_M = 100.0
"""When the foot route shows no steps near either end, move both ends this
far. The sample needed 55–147 m; 100 m covers most of that without making
the unverified stretch long."""

MIN_WHEELCHAIR_LEG_M = 50.0
"""The retried wheelchair leg must be at least this long. Below it, most of
the trip would be unverified and calling it a wheelchair route would mislead,
so we keep the plain foot-walking fallback instead. Together with the
midpoint rule (no end moves past half the route) this skips very short
trips: with no steps found, a trip needs 2 × 100 + 50 = 250 m."""


@dataclass(frozen=True)
class StepRun:
    """A run of steps on the foot route, as along-route distances from the start."""

    start_m: float
    end_m: float


@dataclass(frozen=True)
class NudgePlan:
    """How far to move each endpoint along the foot route (0 = not moved)."""

    start_offset_m: float
    end_offset_m: float
    steps_near_start: bool
    steps_near_end: bool

    @property
    def nudged_ends(self) -> Literal["start", "end", "both"]:
        if self.start_offset_m > 0 and self.end_offset_m > 0:
            return "both"
        return "start" if self.start_offset_m > 0 else "end"


def step_runs(
    cumulative: Sequence[float], waytypes: Sequence[tuple[int, int, int]]
) -> list[StepRun]:
    """Steps on the route, from ORS ``(first_vertex, last_vertex, waytype)`` ranges.

    Ranges that point outside the geometry are ignored rather than trusted.
    """

    runs = []
    for first, last, kind in waytypes:
        if kind == STEPS_WAYTYPE and 0 <= first <= last < len(cumulative):
            runs.append(StepRun(start_m=cumulative[first], end_m=cumulative[last]))
    return runs


def _start_offset(runs: Sequence[StepRun]) -> float | None:
    near = [run.end_m for run in runs if run.start_m <= STEP_SEARCH_RADIUS_M]
    return max(near) + STEP_CLEARANCE_M if near else None


def _end_offset(runs: Sequence[StepRun], total_m: float) -> float | None:
    near = [
        total_m - run.start_m
        for run in runs
        if total_m - run.end_m <= STEP_SEARCH_RADIUS_M
    ]
    return max(near) + STEP_CLEARANCE_M if near else None


def plan_endpoint_nudge(total_m: float, runs: Sequence[StepRun]) -> NudgePlan | None:
    """Where to retry wheelchair from, or ``None`` when the trip is too short.

    Each end with steps nearby moves to just past its last nearby step; the
    other end stays put. With no steps near either end, both move
    ``DEFAULT_NUDGE_M``. No end moves past the midpoint, and the remaining
    wheelchair leg must be at least ``MIN_WHEELCHAIR_LEG_M``.
    """

    start = _start_offset(runs)
    end = _end_offset(runs, total_m)
    plan = NudgePlan(
        start_offset_m=start or 0.0,
        end_offset_m=end or 0.0,
        steps_near_start=start is not None,
        steps_near_end=end is not None,
    )
    if start is None and end is None:
        plan = NudgePlan(DEFAULT_NUDGE_M, DEFAULT_NUDGE_M, False, False)
    half = total_m / 2
    if plan.start_offset_m > half or plan.end_offset_m > half:
        return None
    if total_m - plan.start_offset_m - plan.end_offset_m < MIN_WHEELCHAIR_LEG_M:
        return None
    return plan


def nudged_endpoints(
    coordinates: Sequence[Sequence[float]],
    cumulative: Sequence[float],
    plan: NudgePlan,
) -> tuple[LonLat, LonLat]:
    """The retry's start and end points on the foot route."""

    total = cumulative[-1]
    return (
        point_at_distance(coordinates, cumulative, plan.start_offset_m),
        point_at_distance(coordinates, cumulative, total - plan.end_offset_m),
    )


def _linestring(coordinates: list[LonLat]) -> dict[str, object]:
    return {"type": "LineString", "coordinates": coordinates}


def stitch_nudged_route(
    *,
    foot_coordinates: Sequence[Sequence[float]],
    foot_cumulative: Sequence[float],
    foot_duration_seconds: float,
    plan: NudgePlan,
    wheelchair: RoutingComputation,
    wheelchair_coordinates: list[LonLat],
) -> RoutingComputation:
    """Foot stretch(es) + wheelchair leg as one route with summed totals.

    Stretch durations use the foot route's average pace, so the total stays
    consistent with the walking estimate for the same ground.
    """

    total = foot_cumulative[-1]
    head: list[LonLat] = []
    tail: list[LonLat] = []
    segments: list[UnverifiedSegment] = []
    if plan.start_offset_m > 0:
        head = slice_line(foot_coordinates, foot_cumulative, 0.0, plan.start_offset_m)
        segments.append(_segment("start", plan.start_offset_m, head))
    if plan.end_offset_m > 0:
        tail = slice_line(
            foot_coordinates, foot_cumulative, total - plan.end_offset_m, total
        )
        segments.append(_segment("end", plan.end_offset_m, tail))

    unverified_m = plan.start_offset_m + plan.end_offset_m
    seconds_per_meter = foot_duration_seconds / total if total > 0 else 0.0
    distance = wheelchair.distance_meters + unverified_m
    duration = wheelchair.duration_seconds + unverified_m * seconds_per_meter
    feature = {
        "type": "Feature",
        "geometry": _linestring([*head, *wheelchair_coordinates, *tail]),
        "properties": {"summary": {"distance": distance, "duration": duration}},
    }
    return RoutingComputation(
        geojson_fc={"type": "FeatureCollection", "features": [feature]},
        distance_meters=distance,
        duration_seconds=duration,
        fallback_profile_used=False,
        warnings=wheelchair.warnings,
        unverified_segments=tuple(segments),
    )


def _segment(
    position: Literal["start", "end"], length_m: float, coordinates: list[LonLat]
) -> UnverifiedSegment:
    return UnverifiedSegment(
        position=position,
        length_meters=round(length_m, 1),
        geometry=_linestring(coordinates),
    )
