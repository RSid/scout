"""Refuge restrooms proxy helpers."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from scout.api.deps import HttpDepends, SettingsDepends
from scout.clients import get_restrooms_provider
from scout.clients.restrooms.protocol import RestroomsProvider
from scout.data.schema import RestroomsResponse
from scout.errors import InvalidInputError
from scout.security.rate_limit import POLICIES, limiter

router = APIRouter(tags=["routing"])


async def restrooms_dependency(
    settings: SettingsDepends, http: HttpDepends
) -> RestroomsProvider:
    return get_restrooms_provider(settings, http)


RestroomsDependency = Annotated[RestroomsProvider, Depends(restrooms_dependency)]


@router.get("/restrooms", response_model=RestroomsResponse)
@limiter.limit(POLICIES["restrooms_get"])
async def list_restrooms(
    request: Request, bbox: str, provider: RestroomsDependency
) -> JSONResponse:
    del request
    parts = [p.strip() for p in bbox.split(",")]
    if len(parts) != 4:
        raise InvalidInputError(message="bbox expects west,south,east,north")
    west, south, east, north = (
        float(parts[0]),
        float(parts[1]),
        float(parts[2]),
        float(parts[3]),
    )
    geojson_fc = await provider.restrooms_in_bbox(
        west=west, south=south, east=east, north=north
    )
    raw_features = geojson_fc.get("features", [])
    if not isinstance(raw_features, list):
        raw_features = []
    body = RestroomsResponse(
        type="FeatureCollection",
        features=[dict(f) if isinstance(f, dict) else f for f in raw_features],
    )
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))
