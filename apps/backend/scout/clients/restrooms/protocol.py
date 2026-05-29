"""Restroom provider adapters (DEC-020).

Adapters speak Scout-domain ``Restroom`` objects upward; Refuge wire shapes
stop at the adapter boundary.
"""

from __future__ import annotations

from typing import Protocol

from scout.clients.restrooms.types import Bbox, Restroom


class RestroomsProvider(Protocol):
    async def list_in_bbox(self, bbox: Bbox) -> list[Restroom]: ...
