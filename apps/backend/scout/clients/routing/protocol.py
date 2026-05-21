"""Routing adapters provide wheelchair-aware walking geometries."""

from __future__ import annotations

from typing import Protocol

from scout.clients.routing.types import RoutingComputation


class RoutingProvider(Protocol):
    async def walking_wheelchair_route(
        self, frm: list[float], to: list[float]
    ) -> RoutingComputation: ...
