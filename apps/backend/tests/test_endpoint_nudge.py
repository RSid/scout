"""Pure planning + stitching for the wheelchair endpoint retry (M1-F04)."""

from __future__ import annotations

import pytest

from scout.clients.routing.endpoint_nudge import (
    DEFAULT_NUDGE_M,
    STEP_CLEARANCE_M,
    NudgePlan,
    StepRun,
    nudged_endpoints,
    plan_endpoint_nudge,
    step_runs,
    stitch_nudged_route,
)
from scout.clients.routing.types import RoutingComputation
from scout.geo import cumulative_distances_m, line_length_m
from tests.routing_fixtures import north_of_origin, straight_line

LINE = straight_line(1000.0)
CUMULATIVE = cumulative_distances_m(LINE)


def test_step_runs_keeps_only_steps_with_along_route_distances() -> None:
    ranges = [(0, 3, 7), (3, 5, 8), (5, 100, 7)]

    assert step_runs(CUMULATIVE, ranges) == [
        StepRun(start_m=pytest.approx(30.0), end_m=pytest.approx(50.0))
    ]


@pytest.mark.parametrize(
    "ranges",
    [
        pytest.param([(95, 200, 8)], id="past-last-vertex"),
        pytest.param([(-1, 2, 8)], id="negative-index"),
        pytest.param([(5, 3, 8)], id="reversed"),
    ],
)
def test_step_runs_ignores_ranges_outside_geometry(
    ranges: list[tuple[int, int, int]],
) -> None:
    assert step_runs(CUMULATIVE, ranges) == []


@pytest.mark.parametrize(
    ("runs", "expected_offsets"),
    [
        pytest.param(
            [StepRun(30.0, 50.0)],
            (50.0 + STEP_CLEARANCE_M, 0.0),
            id="steps-near-start-only",
        ),
        pytest.param(
            [StepRun(900.0, 940.0)],
            (0.0, 100.0 + STEP_CLEARANCE_M),
            id="steps-near-end-only",
        ),
        pytest.param(
            [StepRun(10.0, 20.0), StepRun(960.0, 970.0)],
            (20.0 + STEP_CLEARANCE_M, 40.0 + STEP_CLEARANCE_M),
            id="steps-near-both-ends",
        ),
        pytest.param(
            [], (DEFAULT_NUDGE_M, DEFAULT_NUDGE_M), id="no-steps-moves-both-100m"
        ),
        pytest.param(
            [StepRun(500.0, 510.0)],
            (DEFAULT_NUDGE_M, DEFAULT_NUDGE_M),
            id="mid-route-steps-ignored",
        ),
        pytest.param(
            [StepRun(10.0, 20.0), StepRun(150.0, 180.0)],
            (180.0 + STEP_CLEARANCE_M, 0.0),
            id="last-of-several-nearby-steps",
        ),
        pytest.param(
            [StepRun(190.0, 260.0)],
            (260.0 + STEP_CLEARANCE_M, 0.0),
            id="steps-starting-inside-radius-count-in-full",
        ),
    ],
)
def test_plan_endpoint_nudge_offsets(
    runs: list[StepRun], expected_offsets: tuple[float, float]
) -> None:
    plan = plan_endpoint_nudge(1000.0, runs)

    assert plan is not None
    assert (plan.start_offset_m, plan.end_offset_m) == pytest.approx(expected_offsets)


@pytest.mark.parametrize(
    ("total_m", "runs"),
    [
        pytest.param(240.0, [], id="too-short-for-default-nudge"),
        pytest.param(100.0, [StepRun(5.0, 60.0)], id="nudge-past-midpoint"),
        pytest.param(
            420.0,
            [StepRun(150.0, 170.0), StepRun(250.0, 262.0)],
            id="steps-leave-wheelchair-leg-under-minimum",
        ),
        pytest.param(0.0, [], id="empty-route"),
    ],
)
def test_plan_endpoint_nudge_skips_short_routes(
    total_m: float, runs: list[StepRun]
) -> None:
    assert plan_endpoint_nudge(total_m, runs) is None


def test_plan_endpoint_nudge_allows_shortest_default_route() -> None:
    assert plan_endpoint_nudge(250.0, []) is not None


@pytest.mark.parametrize(
    ("plan", "expected"),
    [
        (NudgePlan(70.0, 0.0, True, False), "start"),
        (NudgePlan(0.0, 70.0, False, True), "end"),
        (NudgePlan(100.0, 100.0, False, False), "both"),
    ],
)
def test_nudge_plan_names_moved_ends(plan: NudgePlan, expected: str) -> None:
    assert plan.nudged_ends == expected


def test_nudged_endpoints_are_on_the_route_at_the_offsets() -> None:
    plan = NudgePlan(70.0, 120.0, True, True)

    assert nudged_endpoints(LINE, CUMULATIVE, plan) == (
        pytest.approx(north_of_origin(70.0)),
        pytest.approx(north_of_origin(880.0)),
    )


WHEELCHAIR_LEG = [north_of_origin(72.0), north_of_origin(500.0), north_of_origin(878.0)]
WHEELCHAIR = RoutingComputation(
    geojson_fc={"type": "FeatureCollection", "features": []},
    distance_meters=820.0,
    duration_seconds=600.0,
    warnings=("demo",),
)
BOTH_ENDS = NudgePlan(70.0, 120.0, True, True)


def _stitch(plan: NudgePlan = BOTH_ENDS) -> RoutingComputation:
    return stitch_nudged_route(
        foot_coordinates=LINE,
        foot_cumulative=CUMULATIVE,
        foot_duration_seconds=720.0,
        plan=plan,
        wheelchair=WHEELCHAIR,
        wheelchair_coordinates=WHEELCHAIR_LEG,
    )


def _geometry(result: RoutingComputation) -> list[list[float]]:
    coords: list[list[float]] = result.geojson_fc["features"][0]["geometry"][
        "coordinates"
    ]
    return coords


def test_stitch_geometry_runs_from_foot_start_through_leg_to_foot_end() -> None:
    coords = _geometry(_stitch())

    assert (coords[0], coords[-1], WHEELCHAIR_LEG[1] in coords) == (
        LINE[0],
        LINE[-1],
        True,
    )


def test_stitch_sums_distance() -> None:
    assert _stitch().distance_meters == pytest.approx(820.0 + 70.0 + 120.0)


def test_stitch_prices_stretches_at_foot_pace() -> None:
    # Foot route: 1000 m in 720 s -> 0.72 s/m over 190 m of stretches.
    assert _stitch().duration_seconds == pytest.approx(600.0 + 190.0 * 0.72)


def test_stitch_summary_matches_totals() -> None:
    result = _stitch()

    assert result.geojson_fc["features"][0]["properties"]["summary"] == {
        "distance": result.distance_meters,
        "duration": result.duration_seconds,
    }


def test_stitch_is_not_a_fallback_and_keeps_wheelchair_warnings() -> None:
    result = _stitch()

    assert (result.fallback_profile_used, result.warnings) == (False, ("demo",))


@pytest.mark.parametrize(
    ("plan", "expected"),
    [
        pytest.param(NudgePlan(70.0, 0.0, True, False), [("start", 70.0)], id="start"),
        pytest.param(NudgePlan(0.0, 120.0, False, True), [("end", 120.0)], id="end"),
        pytest.param(BOTH_ENDS, [("start", 70.0), ("end", 120.0)], id="both"),
    ],
)
def test_stitch_reports_unverified_segments(
    plan: NudgePlan, expected: list[tuple[str, float]]
) -> None:
    segments = _stitch(plan).unverified_segments

    assert [(s.position, s.length_meters) for s in segments] == expected


@pytest.mark.parametrize(
    ("index", "expected_first", "expected_last"),
    [
        pytest.param(0, LINE[0], north_of_origin(70.0), id="start"),
        pytest.param(1, north_of_origin(880.0), LINE[-1], id="end"),
    ],
)
def test_stitch_segment_geometry_follows_foot_route(
    index: int, expected_first: list[float], expected_last: list[float]
) -> None:
    coords = _stitch().unverified_segments[index].geometry["coordinates"]

    assert (coords[0], coords[-1]) == (
        pytest.approx(expected_first),
        pytest.approx(expected_last),
    )


def test_stitch_segment_geometry_length_matches_reported_length() -> None:
    segment = _stitch().unverified_segments[1]

    assert line_length_m(segment.geometry["coordinates"]) == pytest.approx(
        segment.length_meters, abs=0.1
    )
