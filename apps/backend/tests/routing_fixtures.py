"""Synthetic ORS Directions bodies for routing tests (owned test data, no I/O).

Routes run due north from a fixed DC point with a vertex every 10 m, so a
vertex index times 10 is its along-route distance in meters.
"""

from __future__ import annotations

from typing import Any

METERS_PER_DEGREE_LAT = 111_195.08
VERTEX_SPACING_M = 10.0
ORIGIN_LON = -77.0
ORIGIN_LAT = 38.9
STEPS = 8
FOOTWAY = 7


def north_of_origin(meters: float) -> list[float]:
    return [ORIGIN_LON, ORIGIN_LAT + meters / METERS_PER_DEGREE_LAT]


def straight_line(length_m: float) -> list[list[float]]:
    vertex_count = int(length_m / VERTEX_SPACING_M) + 1
    return [north_of_origin(i * VERTEX_SPACING_M) for i in range(vertex_count)]


def waytype_values(
    vertex_count: int, step_vertex_ranges: list[tuple[int, int]]
) -> list[list[int]]:
    """Contiguous ORS waytype ranges: footway, with steps where asked."""

    values: list[list[int]] = []
    cursor = 0
    for first, last in sorted(step_vertex_ranges):
        if first > cursor:
            values.append([cursor, first, FOOTWAY])
        values.append([first, last, STEPS])
        cursor = last
    if cursor < vertex_count - 1:
        values.append([cursor, vertex_count - 1, FOOTWAY])
    return values


def ors_body(
    coordinates: list[list[float]],
    *,
    distance: float,
    duration: float,
    extras: dict[str, Any] | None = None,
) -> dict[str, Any]:
    properties: dict[str, Any] = {
        "summary": {"distance": distance, "duration": duration},
        "way_points": [0, len(coordinates) - 1],
    }
    if extras is not None:
        properties["extras"] = extras
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coordinates},
                "properties": properties,
            }
        ],
    }


def foot_body(
    length_m: float,
    *,
    step_vertex_ranges: list[tuple[int, int]] | None = None,
    duration: float | None = None,
) -> dict[str, Any]:
    """Foot-walking body with a `waytype` extra (as Scout requests it)."""

    line = straight_line(length_m)
    values = waytype_values(len(line), step_vertex_ranges or [])
    return ors_body(
        line,
        distance=length_m,
        duration=duration if duration is not None else length_m * 0.72,
        extras={"waytype": {"values": values, "summary": []}},
    )
