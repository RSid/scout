"""Corridor feature queries backing M1-F07."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from scout.data.schema import CorridorMeta, CorridorRequest, CorridorResponse
from scout.data.session import get_session
from scout.data.store import corridor_features_geojson
from scout.security.rate_limit import POLICIES, limiter

router = APIRouter(tags=["routing"])


@router.post("/route-features", response_model=CorridorResponse)
@limiter.limit(POLICIES["route_features_post"])
async def post_route_features(
    request: Request,
    payload: CorridorRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JSONResponse:
    del request
    coords = payload.route_geometry["coordinates"]
    numeric_coords: list[list[float]] = []
    for pair in coords:
        numeric_coords.append([float(pair[0]), float(pair[1])])

    features, elapsed_ms, truncated = await corridor_features_geojson(
        session,
        coordinates=numeric_coords,
        categories=list(payload.categories),
        buffer_meters=float(payload.buffer_meters),
    )
    meta = CorridorMeta(truncated=truncated, time_taken_ms=elapsed_ms)
    payload_out = CorridorResponse(features=features, meta=meta)
    return JSONResponse(status_code=200, content=payload_out.model_dump(mode="json"))
