"""Refuge restrooms proxy helpers."""

from __future__ import annotations

from typing import Annotated, cast

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from scout.clients.restrooms.normalize import restrooms_to_features
from scout.clients.restrooms.protocol import RestroomsProvider
from scout.clients.restrooms.types import Bbox
from scout.data.schema import RestroomGeoJSONFeature, RestroomsResponse
from scout.errors import InvalidInputError
from scout.security.rate_limit import POLICIES, limiter

router = APIRouter(tags=["routing"])


async def restrooms_dependency(request: Request) -> RestroomsProvider:
    """The process-wide provider (and its 24h cache) bound at app startup."""

    return cast(RestroomsProvider, request.app.state.restrooms_provider)


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
    try:
        west, south, east, north = (float(p) for p in parts)
    except ValueError as exc:
        raise InvalidInputError(message="bbox values must be numbers") from exc

    restrooms = await provider.list_in_bbox(
        Bbox(west=west, south=south, east=east, north=north)
    )
    features = [
        RestroomGeoJSONFeature.model_validate(feature)
        for feature in restrooms_to_features(restrooms)
    ]
    body = RestroomsResponse(features=features)
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))
