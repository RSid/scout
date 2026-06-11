"""Corridor feature queries backing M1-F07, with restroom merge (M1-F13.S4)."""

from __future__ import annotations

import logging
import math
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from scout.api.restrooms import RestroomsDependency
from scout.clients.restrooms.corridor import restrooms_along_route
from scout.clients.restrooms.normalize import restrooms_to_features
from scout.clients.restrooms.types import Bbox
from scout.data.categories import unknown_corridor_categories
from scout.data.schema import (
    CorridorGeoJSONFeature,
    CorridorMeta,
    CorridorRequest,
    CorridorResponse,
)
from scout.data.session import get_session
from scout.data.store import corridor_features_geojson
from scout.errors import BufferTooLargeError, UnknownCategoryError
from scout.security.rate_limit import POLICIES, limiter

LOGGER = logging.getLogger("scout")
MAX_BUFFER_METERS = 200
MERGE_LIMIT = 500
RESTROOMS_CATEGORY = "restrooms"
_METERS_PER_DEGREE_LAT = 111_320.0

router = APIRouter(tags=["routing"])


def _route_bbox(coordinates: list[list[float]], buffer_meters: float) -> Bbox:
    """Bounding box of the route padded by the corridor buffer (in degrees)."""

    lons = [c[0] for c in coordinates]
    lats = [c[1] for c in coordinates]
    mean_lat = sum(lats) / len(lats)
    lat_pad = buffer_meters / _METERS_PER_DEGREE_LAT
    lon_pad = buffer_meters / (
        _METERS_PER_DEGREE_LAT * max(0.01, math.cos(math.radians(mean_lat)))
    )
    return Bbox(
        west=min(lons) - lon_pad,
        south=min(lats) - lat_pad,
        east=max(lons) + lon_pad,
        north=max(lats) + lat_pad,
    )


@router.post("/route-features", response_model=CorridorResponse)
@limiter.limit(POLICIES["route_features_post"])
async def post_route_features(
    request: Request,
    payload: CorridorRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
    restrooms_provider: RestroomsDependency,
) -> JSONResponse:
    del request
    buf = int(payload.buffer_meters)
    if buf > MAX_BUFFER_METERS:
        raise BufferTooLargeError(maximum_meters=MAX_BUFFER_METERS)

    cat_tuple = tuple(payload.categories)
    bad = unknown_corridor_categories(cat_tuple)
    if bad:
        raise UnknownCategoryError(unknown_ids=bad)

    numeric_coords = [
        [float(pair[0]), float(pair[1])]
        for pair in payload.route_geometry["coordinates"]
    ]

    # Restrooms never live in PostGIS; query everything else from the corridor
    # SQL and merge restrooms at this boundary (M1-F13.S4).
    pg_categories = [c for c in cat_tuple if c != RESTROOMS_CATEGORY]
    if pg_categories:
        (
            features_raw,
            elapsed_ms,
            truncated,
            feature_count_total,
        ) = await corridor_features_geojson(
            session,
            coordinates=numeric_coords,
            categories=pg_categories,
            buffer_meters=float(buf),
        )
    else:
        features_raw, elapsed_ms, truncated, feature_count_total = [], 0.0, False, 0

    restroom_features: list[dict[str, Any]] = []
    if RESTROOMS_CATEGORY in cat_tuple:
        restrooms = await restrooms_provider.list_in_bbox(
            _route_bbox(numeric_coords, float(buf))
        )
        restroom_features = restrooms_along_route(
            restrooms_to_features(restrooms), numeric_coords, float(buf)
        )

    merged = features_raw + restroom_features
    merged.sort(
        key=lambda f: (f["properties"]["along_route_meters"], f["properties"]["id"])
    )
    feature_count_total += len(restroom_features)
    if len(merged) > MERGE_LIMIT:
        merged = merged[:MERGE_LIMIT]
        truncated = True

    features_validated = [CorridorGeoJSONFeature.model_validate(raw) for raw in merged]
    meta = CorridorMeta(
        truncated=truncated,
        time_taken_ms=elapsed_ms,
        feature_count_total=feature_count_total,
    )
    payload_out = CorridorResponse(features=features_validated, meta=meta)
    LOGGER.info(
        "route=%s status_code=%s duration_ms=%s features_returned=%s "
        "feature_count_total=%s truncated=%s restrooms=%s",
        "/api/route-features",
        200,
        round(elapsed_ms, 2),
        len(features_validated),
        feature_count_total,
        truncated,
        len(restroom_features),
    )
    return JSONResponse(status_code=200, content=payload_out.model_dump(mode="json"))
