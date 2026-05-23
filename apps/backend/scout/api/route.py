"""Wheelchair-first walking routes via adapters (DEC-020)."""

from __future__ import annotations

from typing import Annotated, Any, cast

from fastapi import APIRouter, Depends, Request

from scout.clients.routing.protocol import RoutingProvider
from scout.data.schema import RouteComputeRequest, RouteResponse
from scout.errors import RouteNotFoundError


async def routing_dependency(request: Request) -> RoutingProvider:
    """Lifespan-bound routing adapter (TTL cache survives across requests)."""

    return cast(RoutingProvider, request.app.state.routing_provider)


RoutingDependency = Annotated[RoutingProvider, Depends(routing_dependency)]


router = APIRouter(tags=["routing"])


@router.post("/route")
async def compute_route(
    body: RouteComputeRequest,
    routing: RoutingDependency,
) -> RouteResponse:
    route = await routing.walking_wheelchair_route(
        [float(body.frm[0]), float(body.frm[1])],
        [float(body.to[0]), float(body.to[1])],
        profile=body.profile,
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

    first_props = dict(features[0].get("properties") or {})
    merged = {**first_props, **summary_props}
    features[0]["properties"] = merged

    return RouteResponse(features=features)
