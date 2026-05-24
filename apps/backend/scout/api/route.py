"""Wheelchair-first walking routes via adapters (DEC-020)."""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from scout.api.deps import HttpDepends, SettingsDepends
from scout.clients import get_routing_provider
from scout.clients.routing.protocol import RoutingProvider
from scout.data.schema import RouteComputeRequest, RouteResponse
from scout.errors import RouteNotFoundError
from scout.security.rate_limit import POLICIES, limiter


async def routing_dependency(
    settings: SettingsDepends, client: HttpDepends
) -> RoutingProvider:
    return get_routing_provider(settings, client)


RoutingDependency = Annotated[RoutingProvider, Depends(routing_dependency)]


router = APIRouter(tags=["routing"])


@router.post("/route", response_model=RouteResponse)
@limiter.limit(POLICIES["route_post"])
async def compute_route(
    request: Request,
    body: RouteComputeRequest,
    routing: RoutingDependency,
) -> JSONResponse:
    del request
    route = await routing.walking_wheelchair_route(
        [float(body.frm[0]), float(body.frm[1])], [float(body.to[0]), float(body.to[1])]
    )
    geojson_fc: dict[str, Any] = dict(route.geojson_fc)
    features_raw = geojson_fc.get("features") or []
    features = list(features_raw)
    if not features:
        raise RouteNotFoundError(message="Upstream routing returned no geometry.")
    summary_props = {
        "distance_meters": route.distance_meters,
        "duration_seconds": route.duration_seconds,
        "fallback_profile_used": route.fallback_profile_used,
        "warnings": list(route.warnings),
    }

    if not features:
        summary_feature = {
            "type": "Feature",
            "geometry": None,
            "properties": summary_props,
        }
        features = [summary_feature]
    else:
        first_props = dict(features[0].get("properties") or {})
        merged = {**first_props, **summary_props}
        features[0]["properties"] = merged

    payload = RouteResponse(features=features)
    return JSONResponse(status_code=200, content=payload.model_dump(mode="json"))
