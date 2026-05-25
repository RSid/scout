"""OpenRouteService routing adapter."""

from __future__ import annotations

import logging
from collections import OrderedDict
from time import monotonic
from typing import Any

import httpx

from scout.clients.routing.constants import FALLBACK_PROFILE_WARNING
from scout.clients.routing.protocol import RoutingProvider
from scout.clients.routing.types import RoutingComputation
from scout.config import Settings
from scout.errors import (
    ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
    RouteNotFoundError,
    RouteServiceUnavailableError,
)

LOGGER = logging.getLogger("scout")

RoutingCacheKey = tuple[str | int, ...]


def routing_cache_key(profile: str, pairs: list[float]) -> RoutingCacheKey:
    """Cache key: request profile plus four-decimal rounded lon/lat pairs."""

    token = profile.strip().lower()
    coords = tuple(int(round(coord * 10_000)) for coord in pairs)
    return (token,) + coords


class TTLCache[R]:
    """256-entry LRU with 24-hour expiry (M1-F04 scaffolding)."""

    def __init__(self, *, maxlen: int = 256, ttl_seconds: float = 86400.0) -> None:
        self.maxlen = maxlen
        self.ttl_seconds = ttl_seconds
        self._store: OrderedDict[RoutingCacheKey, tuple[float, R]] = OrderedDict()

    def get(self, key: RoutingCacheKey) -> R | None:
        now = monotonic()
        if key not in self._store:
            return None
        stamp, payload = self._store[key]
        if now - stamp > self.ttl_seconds:
            del self._store[key]
            return None
        self._store.move_to_end(key)
        return payload

    def set(self, key: RoutingCacheKey, payload: R) -> None:
        now = monotonic()
        self._store[key] = (now, payload)
        self._store.move_to_end(key)
        while len(self._store) > self.maxlen:
            self._store.popitem(last=False)


class OpenRouteServiceProvider(RoutingProvider):
    """Calls the public hosted ORS Directions API."""

    def __init__(self, *, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._cache: TTLCache[RoutingComputation] = TTLCache()

    async def walking_route(
        self,
        frm: list[float],
        to: list[float],
        *,
        profile: str,
    ) -> RoutingComputation:
        # `profile` is the Scout-domain mode token. M1 wires only
        # "wheelchair" through, but we key the cache on whatever the
        # caller asked for so future modes (M2-F18) don't collide.
        key = routing_cache_key(profile, frm + to)
        cached = self._cache.get(key)
        if cached is not None:
            LOGGER.info(
                "route_cache",
                extra={
                    "cache_hit": True,
                    "fallback_profile_used": cached.fallback_profile_used,
                    "upstream_service": "openrouteservice",
                },
            )
            return cached

        LOGGER.info(
            "route_cache",
            extra={
                "cache_hit": False,
                "fallback_profile_used": False,
                "upstream_service": "openrouteservice",
            },
        )

        coords = [[frm[0], frm[1]], [to[0], to[1]]]
        fallback_used = False
        api_key = (self._settings.ors_api_key or "").strip()
        if not api_key:
            raise RouteServiceUnavailableError(
                message="Routing service credentials are missing for this deployment."
            )

        # M1 only requests the wheelchair-aware ORS profile; foot-walking is
        # the internal fallback (S3). When more Scout-domain modes land we
        # will dispatch from `profile` to a vendor string here, not in the
        # caller.
        try:
            response = await self._call_directions("wheelchair", coords, api_key)
        except RouteNotFoundError:
            response = await self._call_directions("foot-walking", coords, api_key)
            fallback_used = True
        computation = self._ors_body_to_computation(
            response, fallback_used=fallback_used
        )
        if fallback_used:
            computation = computation.model_copy(
                update={
                    "warnings": (*computation.warnings, FALLBACK_PROFILE_WARNING),
                }
            )

        self._cache.set(key, computation)
        return computation

    async def _call_directions(
        self, profile: str, coordinates: list[list[float]], api_key: str
    ) -> dict[str, Any]:
        route = profile.replace("/", "").strip()
        url = f"{self._settings.ors_base_url.rstrip('/')}/v2/directions/{route}/geojson"
        headers = {"Content-Type": "application/json"}
        token = (
            api_key if api_key.lower().startswith("bearer ") else f"Bearer {api_key}"
        )
        headers["Authorization"] = token

        payload: dict[str, Any] = {
            "coordinates": coordinates,
            "instructions": False,
            "units": "m",
        }

        try:
            resp = await self._client.post(
                url, json=payload, headers=headers, timeout=15.0
            )
        except httpx.HTTPError as exc:
            raise RouteServiceUnavailableError(
                message=ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
            ) from exc

        if resp.status_code == 429:
            raise RouteServiceUnavailableError(message="Routing rate limit exhausted.")
        if resp.status_code in {401, 403}:
            raise RouteServiceUnavailableError(message="Routing credentials rejected.")
        if resp.status_code in {404, 204} or not resp.content:
            raise RouteNotFoundError()
        if resp.status_code >= 500:
            raise RouteServiceUnavailableError(
                message=ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
            )
        try:
            parsed: Any = resp.json()
        except ValueError:
            raise RouteServiceUnavailableError(
                message=ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
            ) from None
        if not isinstance(parsed, dict):
            raise RouteServiceUnavailableError(
                message=ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
            )
        body: dict[str, Any] = parsed
        return body

    def _ors_body_to_computation(
        self, body: dict[str, Any], *, fallback_used: bool
    ) -> RoutingComputation:
        features_any = body.get("features")
        if not isinstance(features_any, list) or len(features_any) == 0:
            raise RouteNotFoundError()

        summary: dict[str, Any] | None = None
        metadata = body.get("metadata")
        if isinstance(metadata, dict):
            maybe_summary = metadata.get("summary")
            if isinstance(maybe_summary, dict):
                summary = maybe_summary
        top_props = body.get("properties")
        if summary is None and isinstance(top_props, dict):
            maybe_summary_top = top_props.get("summary")
            if isinstance(maybe_summary_top, dict):
                summary = maybe_summary_top

        distance_meters = float(summary.get("distance", 0.0)) if summary else 0.0
        duration_seconds = float(summary.get("duration", 0.0)) if summary else 0.0
        warnings: tuple[str, ...] = ()
        if summary:
            warns = summary.get("warnings")
            if isinstance(warns, list):
                warnings = tuple(str(w) for w in warns)

        geojson_fc: dict[str, Any] = {
            "type": "FeatureCollection",
            "features": features_any,
        }

        return RoutingComputation(
            geojson_fc=geojson_fc,
            distance_meters=distance_meters,
            duration_seconds=duration_seconds,
            fallback_profile_used=fallback_used,
            warnings=warnings,
        )
