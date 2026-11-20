"""Pure geodesy helpers in `scout.geo`."""

from __future__ import annotations

import pytest

from scout.geo import (
    cumulative_distances_m,
    haversine_m,
    line_length_m,
    point_at_distance,
    slice_line,
)

# One degree of latitude on the mean-radius sphere `scout.geo` uses.
METERS_PER_DEGREE_LAT = 111_195.08
LON = -77.0
LAT = 38.9


def _north(meters: float) -> list[float]:
    return [LON, LAT + meters / METERS_PER_DEGREE_LAT]


LINE = [_north(0), _north(100), _north(300)]
CUMULATIVE = cumulative_distances_m(LINE)


def test_haversine_one_degree_of_latitude() -> None:
    assert haversine_m(LON, 38.0, LON, 39.0) == pytest.approx(
        METERS_PER_DEGREE_LAT, rel=1e-6
    )


def test_haversine_is_zero_for_same_point() -> None:
    assert haversine_m(LON, LAT, LON, LAT) == 0.0


@pytest.mark.parametrize(
    ("coordinates", "expected"),
    [
        pytest.param([], [], id="empty"),
        pytest.param([_north(0)], [0.0], id="single-point"),
        pytest.param(LINE, [0.0, 100.0, 300.0], id="three-points"),
    ],
)
def test_cumulative_distances(
    coordinates: list[list[float]], expected: list[float]
) -> None:
    assert cumulative_distances_m(coordinates) == pytest.approx(expected, abs=0.01)


@pytest.mark.parametrize(
    ("coordinates", "expected"),
    [
        pytest.param([], 0.0, id="empty"),
        pytest.param([_north(0)], 0.0, id="single-point"),
        pytest.param(LINE, 300.0, id="three-points"),
    ],
)
def test_line_length(coordinates: list[list[float]], expected: float) -> None:
    assert line_length_m(coordinates) == pytest.approx(expected, abs=0.01)


@pytest.mark.parametrize(
    ("distance", "expected"),
    [
        pytest.param(0.0, _north(0), id="start"),
        pytest.param(50.0, _north(50), id="inside-first-step"),
        pytest.param(100.0, _north(100), id="on-vertex"),
        pytest.param(250.0, _north(250), id="inside-second-step"),
        pytest.param(300.0, _north(300), id="end"),
        pytest.param(-5.0, _north(0), id="clamped-below"),
        pytest.param(900.0, _north(300), id="clamped-above"),
    ],
)
def test_point_at_distance(distance: float, expected: list[float]) -> None:
    assert point_at_distance(LINE, CUMULATIVE, distance) == pytest.approx(expected)


def test_point_at_distance_rejects_empty_line() -> None:
    with pytest.raises(ValueError):
        point_at_distance([], [], 10.0)


def test_slice_line_keeps_inner_vertices_and_interpolates_ends() -> None:
    expected = [_north(50), _north(100), _north(250)]

    assert slice_line(LINE, CUMULATIVE, 50.0, 250.0) == [
        pytest.approx(point) for point in expected
    ]


def test_slice_line_length_matches_requested_span() -> None:
    assert line_length_m(slice_line(LINE, CUMULATIVE, 20.0, 170.0)) == pytest.approx(
        150.0, abs=0.01
    )


def test_slice_line_rejects_reversed_span() -> None:
    with pytest.raises(ValueError):
        slice_line(LINE, CUMULATIVE, 200.0, 100.0)
