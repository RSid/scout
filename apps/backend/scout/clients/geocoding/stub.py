"""Offline stub geocoder."""

from __future__ import annotations

from typing import Any

from scout.clients.geocoding.protocol import GeocodingProvider


class StubGeocodingProvider(GeocodingProvider):
    async def search(self, query: str) -> list[dict[str, Any]]:  # noqa: ARG002
        return []
