"""Small, pure geodesy helpers for lon/lat polylines (WGS84 degrees, meters).

Haversine on a spherical Earth is accurate to well under 1% at city scale,
which is plenty for route lengths, along-route offsets, and buffer checks.
"""

from __future__ import annotations

import math
from collections.abc import Sequence

type LonLat = list[float]
"""One ``[lon, lat]`` position, GeoJSON order."""

# Mean Earth radius (meters).
EARTH_RADIUS_M = 6371008.8


def haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    """Great-circle distance in meters between two lon/lat points."""

    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(a))


def cumulative_distances_m(coordinates: Sequence[Sequence[float]]) -> list[float]:
    """Distance from the first vertex to each vertex along the line.

    Same length as ``coordinates``; ``[0.0]`` for a single point, ``[]`` for
    none. The last value is the line's total length.
    """

    if not coordinates:
        return []
    totals = [0.0]
    for prev, cur in zip(coordinates, coordinates[1:], strict=False):
        totals.append(totals[-1] + haversine_m(prev[0], prev[1], cur[0], cur[1]))
    return totals


def line_length_m(coordinates: Sequence[Sequence[float]]) -> float:
    """Total length of a lon/lat polyline in meters (0 for < 2 points)."""

    totals = cumulative_distances_m(coordinates)
    return totals[-1] if totals else 0.0


def point_at_distance(
    coordinates: Sequence[Sequence[float]],
    cumulative: Sequence[float],
    distance_m: float,
) -> LonLat:
    """The point ``distance_m`` along the line, interpolated between vertices.

    ``cumulative`` must come from :func:`cumulative_distances_m` for the same
    line. Distances outside ``[0, length]`` clamp to the line's ends. Linear
    interpolation in lon/lat is fine over one vertex-to-vertex step (meters).
    """

    if not coordinates:
        raise ValueError("point_at_distance needs at least one coordinate")
    if distance_m <= 0:
        return [float(coordinates[0][0]), float(coordinates[0][1])]
    for i in range(1, len(coordinates)):
        if cumulative[i] >= distance_m:
            step = cumulative[i] - cumulative[i - 1]
            fraction = 0.0 if step == 0 else (distance_m - cumulative[i - 1]) / step
            a, b = coordinates[i - 1], coordinates[i]
            return [
                float(a[0] + (b[0] - a[0]) * fraction),
                float(a[1] + (b[1] - a[1]) * fraction),
            ]
    return [float(coordinates[-1][0]), float(coordinates[-1][1])]


def slice_line(
    coordinates: Sequence[Sequence[float]],
    cumulative: Sequence[float],
    start_m: float,
    end_m: float,
) -> list[LonLat]:
    """The part of the line between two along-line distances, in line order.

    Includes interpolated endpoints and every original vertex strictly
    between them, so the slice traces the original geometry.
    """

    if end_m < start_m:
        raise ValueError("slice_line needs start_m <= end_m")
    inner = [
        [float(c[0]), float(c[1])]
        for c, along in zip(coordinates, cumulative, strict=True)
        if start_m < along < end_m
    ]
    return [
        point_at_distance(coordinates, cumulative, start_m),
        *inner,
        point_at_distance(coordinates, cumulative, end_m),
    ]
