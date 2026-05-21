"""Corridor feature queries backing M1-F07."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from scout.data.schema import CorridorMeta, CorridorRequest, CorridorResponse
from scout.data.session import get_session
from scout.data.store import corridor_features_geojson

router = APIRouter(tags=["routing"])


@router.post("/route-features")
async def post_route_features(
    payload: CorridorRequest,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CorridorResponse:
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
    return CorridorResponse(features=features, meta=meta)
