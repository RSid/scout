"""Offline routing adapter for deterministic tests."""

from __future__ import annotations

from scout.clients.routing.constants import FALLBACK_PROFILE_WARNING
from scout.clients.routing.protocol import RoutingProvider
from scout.clients.routing.types import RoutingComputation


class StubRoutingProvider(RoutingProvider):
    def __init__(self, *, force_fallback: bool = False) -> None:
        self._force_fallback = force_fallback

    async def walking_wheelchair_route(
        self,
        frm: list[float],
        to: list[float],
        *,
        profile: str = "wheelchair",
    ) -> RoutingComputation:  # noqa: ARG002
        line_geom = {
            "type": "LineString",
            "coordinates": [[frm[0], frm[1]], [to[0], to[1]]],
        }
        feature = {"type": "Feature", "geometry": line_geom, "properties": {}}
        geojson_fc = {"type": "FeatureCollection", "features": [feature]}
        if self._force_fallback:
            return RoutingComputation(
                geojson_fc=geojson_fc,
                distance_meters=1200.5,
                duration_seconds=840.25,
                fallback_profile_used=True,
                warnings=(FALLBACK_PROFILE_WARNING,),
            )
        return RoutingComputation(
            geojson_fc=geojson_fc,
            distance_meters=1200.5,
            duration_seconds=840.25,
            fallback_profile_used=False,
            warnings=(),
        )
