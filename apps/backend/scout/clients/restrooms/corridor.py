"""Project normalized restroom features onto a route corridor.

Restrooms are not stored in PostGIS (appendix-data-schema.md B.8), so the
along-route distance and buffer membership that the SQL corridor query
computes for DC features are computed here in Python at the
``/api/route-features`` handler boundary (M1-F13.S4).
"""

from __future__ import annotations

import math
from collections.abc import Sequence
from typing import Any

# shapely ships no type stubs; geometry ops below stay locally typed as float.
from shapely.geometry import LineString, Point  # type: ignore[import-untyped]

# Mean Earth radius (meters); matches geographic distance closely enough for
# along-route ordering and buffer membership at city scale.
_EARTH_RADIUS_M = 6371008.8


def _haversine_m(lon1: float, lat1: float, lon2: float, lat2: float) -> float:
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)
    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * _EARTH_RADIUS_M * math.asin(math.sqrt(a))


def _route_length_m(coordinates: Sequence[Sequence[float]]) -> float:
    return sum(
        _haversine_m(
            coordinates[i][0],
            coordinates[i][1],
            coordinates[i + 1][0],
            coordinates[i + 1][1],
        )
        for i in range(len(coordinates) - 1)
    )


def restrooms_along_route(
    features: list[dict[str, Any]],
    coordinates: Sequence[Sequence[float]],
    buffer_meters: float,
) -> list[dict[str, Any]]:
    """Keep restrooms within ``buffer_meters`` of the route, tagging distance.

    Adds ``along_route_meters`` to each surviving feature's properties using the
    same normalized fraction × route-length formula as the PostGIS corridor
    query, so merged ordering stays coherent.
    """

    if len(coordinates) < 2:
        return []
    line = LineString([(c[0], c[1]) for c in coordinates])
    route_length_m = _route_length_m(coordinates)

    projected: list[dict[str, Any]] = []
    for feature in features:
        lng, lat = feature["geometry"]["coordinates"]
        fraction = line.project(Point(lng, lat), normalized=True)
        nearest = line.interpolate(fraction, normalized=True)
        if _haversine_m(lng, lat, nearest.x, nearest.y) > buffer_meters:
            continue
        properties = {
            **feature["properties"],
            "along_route_meters": round(fraction * route_length_m, 1),
        }
        projected.append({**feature, "properties": properties})
    return projected
