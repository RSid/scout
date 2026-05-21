"""OpenRouteService routing adapter."""

from __future__ import annotations

from collections import OrderedDict
from time import monotonic
from typing import Any

import httpx

from scout.clients.routing.protocol import RoutingProvider
from scout.clients.routing.types import RoutingComputation
from scout.config import Settings
from scout.errors import RouteNotFoundError, UpstreamUnavailableError


def _routing_cache_key(pairs: list[float]) -> tuple[int, ...]:
    """Round-four-decimal cache key aligned with scaffold prompt LRU behavior."""

    return tuple(int(round(coord * 10_000)) for coord in pairs)


class TTLCache[R]:
    """256-entry LRU with 24-hour expiry (M1-F04 scaffolding)."""

    def __init__(self, *, maxlen: int = 256, ttl_seconds: float = 86400.0) -> None:
        self.maxlen = maxlen
        self.ttl_seconds = ttl_seconds
        self._store: OrderedDict[tuple[int, ...], tuple[float, R]] = OrderedDict()

    def get(self, key: tuple[int, ...]) -> R | None:
        now = monotonic()
        if key not in self._store:
            return None
        stamp, payload = self._store[key]
        if now - stamp > self.ttl_seconds:
            del self._store[key]
            return None
        self._store.move_to_end(key)
        return payload

    def set(self, key: tuple[int, ...], payload: R) -> None:
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

    async def walking_wheelchair_route(
        self, frm: list[float], to: list[float]
    ) -> RoutingComputation:
        key = _routing_cache_key(frm + to)
        cached = self._cache.get(key)
        if cached is not None:
            return cached

        coords = [[frm[0], frm[1]], [to[0], to[1]]]
        fallback_used = False
        api_key = (self._settings.ors_api_key or "").strip()
        if not api_key:
            raise UpstreamUnavailableError(
                message="Routing service credentials are missing for this deployment."
            )

        try:
            response = await self._call_directions("wheelchair", coords, api_key)
        except RouteNotFoundError:
            response = await self._call_directions("foot-walking", coords, api_key)
            fallback_used = True
        computation = self._ors_body_to_computation(
            response, fallback_used=fallback_used
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
            raise UpstreamUnavailableError(
                message="Route service unreachable."
            ) from exc

        if resp.status_code == 429:
            raise UpstreamUnavailableError(message="Routing rate limit exhausted.")
        if resp.status_code in {401, 403}:
            raise UpstreamUnavailableError(message="Routing credentials rejected.")
        if resp.status_code in {404, 204} or not resp.content:
            raise RouteNotFoundError()
        if resp.status_code >= 500:
            raise UpstreamUnavailableError()
        try:
            parsed: Any = resp.json()
        except ValueError:
            raise UpstreamUnavailableError() from None
        if not isinstance(parsed, dict):
            raise UpstreamUnavailableError()
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
