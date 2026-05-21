"""Geocoder protocol (DEC-020)."""

from __future__ import annotations

from typing import Any, Protocol


class GeocodingProvider(Protocol):
    async def search(self, query: str) -> list[dict[str, Any]]: ...
