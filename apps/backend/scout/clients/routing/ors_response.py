"""Translate ORS Directions GeoJSON bodies into Scout routing types (DEC-020).

Pure functions only; the HTTP call lives in ``openrouteservice.py``.
"""

from __future__ import annotations

from typing import Any

from scout.clients.routing.types import RoutingComputation
from scout.errors import RouteNotFoundError


def _first_feature_properties(body: dict[str, Any]) -> dict[str, Any] | None:
    features = body.get("features")
    if not isinstance(features, list) or not features:
        return None
    first = features[0]
    if not isinstance(first, dict):
        return None
    props = first.get("properties")
    return props if isinstance(props, dict) else None


def _summary(body: dict[str, Any]) -> dict[str, Any] | None:
    # ORS Directions GeoJSON puts `summary` on `features[0].properties.summary`
    # (`https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/`).
    # Older mocks placed it on `metadata.summary` or top-level `properties.summary`;
    # we keep those as fallbacks so existing fixtures still parse.
    feature_props = _first_feature_properties(body)
    candidates = (
        feature_props,
        body.get("metadata"),
        body.get("properties"),
    )
    for holder in candidates:
        if isinstance(holder, dict):
            summary = holder.get("summary")
            if isinstance(summary, dict):
                return summary
    return None


def ors_body_to_computation(
    body: dict[str, Any], *, fallback_used: bool
) -> RoutingComputation:
    """Scout routing result for one ORS Directions response body."""

    features_any = body.get("features")
    if not isinstance(features_any, list) or len(features_any) == 0:
        raise RouteNotFoundError()

    summary = _summary(body)
    distance_meters = float(summary.get("distance", 0.0)) if summary else 0.0
    duration_seconds = float(summary.get("duration", 0.0)) if summary else 0.0
    warnings: tuple[str, ...] = ()
    if summary:
        warns = summary.get("warnings")
        if isinstance(warns, list):
            warnings = tuple(str(w) for w in warns)

    return RoutingComputation(
        geojson_fc={"type": "FeatureCollection", "features": features_any},
        distance_meters=distance_meters,
        duration_seconds=duration_seconds,
        fallback_profile_used=fallback_used,
        warnings=warnings,
    )


def route_coordinates(body: dict[str, Any]) -> list[list[float]]:
    """The first feature's LineString positions, or ``[]`` if malformed."""

    features = body.get("features")
    if not isinstance(features, list) or not features:
        return []
    first = features[0]
    geometry = first.get("geometry") if isinstance(first, dict) else None
    if not isinstance(geometry, dict) or geometry.get("type") != "LineString":
        return []
    coords = geometry.get("coordinates")
    if not isinstance(coords, list):
        return []
    positions: list[list[float]] = []
    for position in coords:
        if not isinstance(position, list) or len(position) < 2:
            return []
        positions.append([float(position[0]), float(position[1])])
    return positions


def waytype_ranges(body: dict[str, Any]) -> list[tuple[int, int, int]]:
    """``extras.waytype.values`` as ``(first_vertex, last_vertex, waytype)``.

    Returns ``[]`` when the body carries no (or malformed) waytype extra.
    Shape documented at
    https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/extra-info/
    """

    props = _first_feature_properties(body)
    extras = props.get("extras") if props else None
    waytype = extras.get("waytype") if isinstance(extras, dict) else None
    values = waytype.get("values") if isinstance(waytype, dict) else None
    if not isinstance(values, list):
        return []
    ranges: list[tuple[int, int, int]] = []
    for row in values:
        if not isinstance(row, list) or len(row) != 3:
            return []
        try:
            first, last, kind = (int(v) for v in row)
        except (TypeError, ValueError):
            return []
        ranges.append((first, last, kind))
    return ranges


def without_extras(body: dict[str, Any]) -> dict[str, Any]:
    """Copy of ``body`` with ``extras`` removed from the first feature.

    ``extras`` is ORS-specific detail we only request for our own planning; it
    must not leak into the Scout route response.
    """

    features = body.get("features")
    if not isinstance(features, list) or not features:
        return body
    first = features[0]
    if not isinstance(first, dict) or not isinstance(first.get("properties"), dict):
        return body
    props = {k: v for k, v in first["properties"].items() if k != "extras"}
    return {**body, "features": [{**first, "properties": props}, *features[1:]]}
