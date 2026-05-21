"""Offline restrooms adapter for tests."""

from __future__ import annotations

from typing import Any

from scout.clients.restrooms.protocol import RestroomsProvider


class StubRestroomsProvider(RestroomsProvider):
    async def restrooms_in_bbox(
        self,
        west: float,  # noqa: ARG002
        south: float,
        east: float,
        north: float,
    ) -> dict[str, Any]:
        del south, east, north, west
        return {"type": "FeatureCollection", "features": []}
