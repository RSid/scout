"""Project normalized restroom features onto a route corridor.

Restrooms are not stored in PostGIS (appendix-data-schema.md B.8), so the
along-route distance and buffer membership that the SQL corridor query
computes for DC features are computed here in Python at the
``/api/route-features`` handler boundary (M1-F13.S4).
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

# shapely ships no type stubs; geometry ops below stay locally typed as float.
from shapely.geometry import LineString, Point  # type: ignore[import-untyped]

from scout.geo import haversine_m, line_length_m


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
    route_length_m = line_length_m(coordinates)

    projected: list[dict[str, Any]] = []
    for feature in features:
        lng, lat = feature["geometry"]["coordinates"]
        fraction = line.project(Point(lng, lat), normalized=True)
        nearest = line.interpolate(fraction, normalized=True)
        if haversine_m(lng, lat, nearest.x, nearest.y) > buffer_meters:
            continue
        properties = {
            **feature["properties"],
            "along_route_meters": round(fraction * route_length_m, 1),
        }
        projected.append({**feature, "properties": properties})
    return projected
