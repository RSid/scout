"""Nominatim adapter (wired in via DEC-020; HTTP surface lands with M1-F03)."""

from __future__ import annotations

from typing import Any

import httpx

from scout.clients.geocoding.protocol import GeocodingProvider
from scout.config import Settings
from scout.errors import UpstreamUnavailableError


class NominatimProvider(GeocodingProvider):
    def __init__(self, *, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client

    async def search(self, query: str) -> list[dict[str, Any]]:
        headers = {"User-Agent": self._settings.nominatim_user_agent}
        params: dict[str, str | int | float | bool | None] = {
            "q": query,
            "format": "jsonv2",
            "limit": 5,
        }
        try:
            resp = await self._client.get(
                f"{self._settings.nominatim_base_url.rstrip('/')}/search",
                params=params,
                headers=headers,
                timeout=5.0,
            )
        except httpx.HTTPError as exc:
            raise UpstreamUnavailableError(
                message="Geocoding service unreachable."
            ) from exc
        if resp.status_code >= 400:
            raise UpstreamUnavailableError()
        payload = resp.json()
        return payload if isinstance(payload, list) else []
