"""Corridor feature queries backing M1-F07."""

from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

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

router = APIRouter(tags=["routing"])


@router.post("/route-features", response_model=CorridorResponse)
@limiter.limit(POLICIES["route_features_post"])
async def post_route_features(
    request: Request,
    payload: CorridorRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JSONResponse:
    del request
    buf = int(payload.buffer_meters)
    if buf > MAX_BUFFER_METERS:
        raise BufferTooLargeError(maximum_meters=MAX_BUFFER_METERS)

    cat_tuple = tuple(payload.categories)
    bad = unknown_corridor_categories(cat_tuple)
    if bad:
        raise UnknownCategoryError(unknown_ids=bad)

    coords = payload.route_geometry["coordinates"]
    numeric_coords: list[list[float]] = []
    for pair in coords:
        numeric_coords.append([float(pair[0]), float(pair[1])])

    (
        features_raw,
        elapsed_ms,
        truncated,
        feature_count_total,
    ) = await corridor_features_geojson(
        session,
        coordinates=numeric_coords,
        categories=list(cat_tuple),
        buffer_meters=float(buf),
    )
    features_validated = [
        CorridorGeoJSONFeature.model_validate(raw) for raw in features_raw
    ]
    meta = CorridorMeta(
        truncated=truncated,
        time_taken_ms=elapsed_ms,
        feature_count_total=feature_count_total,
    )
    payload_out = CorridorResponse(features=features_validated, meta=meta)
    features_returned = len(features_validated)
    LOGGER.info(
        "route=%s status_code=%s duration_ms=%s features_returned=%s "
        "feature_count_total=%s truncated=%s",
        "/api/route-features",
        200,
        round(elapsed_ms, 2),
        features_returned,
        feature_count_total,
        truncated,
    )
    return JSONResponse(status_code=200, content=payload_out.model_dump(mode="json"))
