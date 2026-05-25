"""Address geocoding (`M1-F03`, `DEC-023`).

Public endpoints:

- `GET /api/geocode/search?q=<query>&limit=<int>` — autocomplete-style
  forward geocode over the bundled DC MAR snapshot.
- `GET /api/geocode/reverse?lon=<float>&lat=<float>` — single
  reverse-geocode lookup for the "Use my location" affordance.

Browser callers MUST hit these endpoints (never an upstream geocoder
directly). Typed address strings are matched on Scout's servers only.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from scout.api.deps import SettingsDepends
from scout.clients import get_geocoding_provider
from scout.clients.geocoding.protocol import AddressHit, GeocodingProvider
from scout.data.schema import (
    ApiAddressHit,
    GeocodeReverseResponse,
    GeocodeSearchResponse,
)
from scout.data.session import get_session
from scout.errors import InvalidInputError
from scout.security.rate_limit import POLICIES, limiter

router = APIRouter(tags=["geocoding"])

_MIN_QUERY_LENGTH = 3
_MAX_QUERY_LENGTH = 200
_MAX_LIMIT = 10
_MIN_LON, _MAX_LON = -180.0, 180.0
_MIN_LAT, _MAX_LAT = -90.0, 90.0


async def geocoding_dependency(
    settings: SettingsDepends,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GeocodingProvider:
    return get_geocoding_provider(settings, session)


GeocodingDependency = Annotated[GeocodingProvider, Depends(geocoding_dependency)]


def _to_api_hit(hit: AddressHit) -> ApiAddressHit:
    return ApiAddressHit(id=hit.id, label=hit.label, lon=hit.lon, lat=hit.lat)


@router.get("/geocode/search", response_model=GeocodeSearchResponse)
@limiter.limit(POLICIES["geocode_get"])
async def search_addresses(
    request: Request,
    provider: GeocodingDependency,
    q: Annotated[str, Query(min_length=1, max_length=_MAX_QUERY_LENGTH)],
    limit: Annotated[int, Query(ge=1, le=_MAX_LIMIT)] = 5,
) -> JSONResponse:
    del request
    trimmed = q.strip()
    if len(trimmed) < _MIN_QUERY_LENGTH:
        # Match the frontend's debounce guard so a runaway client cannot
        # cheaply blast 2-char strings at the datastore.
        raise InvalidInputError(message="query must be at least 3 characters")
    hits = await provider.search(trimmed, limit=limit)
    body = GeocodeSearchResponse(hits=[_to_api_hit(h) for h in hits])
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))


@router.get("/geocode/reverse", response_model=GeocodeReverseResponse)
@limiter.limit(POLICIES["geocode_get"])
async def reverse_geocode(
    request: Request,
    provider: GeocodingDependency,
    lon: Annotated[float, Query(ge=_MIN_LON, le=_MAX_LON)],
    lat: Annotated[float, Query(ge=_MIN_LAT, le=_MAX_LAT)],
) -> JSONResponse:
    del request
    hit = await provider.reverse(lon, lat)
    body = GeocodeReverseResponse(hit=_to_api_hit(hit))
    return JSONResponse(status_code=200, content=body.model_dump(mode="json"))
