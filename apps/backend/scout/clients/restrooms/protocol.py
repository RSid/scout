"""Restroom provider adapters (DEC-020)."""

from __future__ import annotations

from typing import Any, Protocol


class RestroomsProvider(Protocol):
    async def restrooms_in_bbox(
        self, west: float, south: float, east: float, north: float
    ) -> dict[str, Any]: ...
