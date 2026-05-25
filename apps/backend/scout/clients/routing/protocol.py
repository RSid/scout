"""Routing adapters that compute mobility-aware walking geometries (DEC-020).

`profile` crosses this boundary as a Scout-domain mode token chosen by the
caller (today driven by the `POST /api/route` request body, per PRD §6.1
M1-F04). Concrete adapters translate the token into the upstream provider's
own profile string. Adapters never accept vendor-shaped values upward.
"""

from __future__ import annotations

from typing import Protocol

from scout.clients.routing.types import RoutingComputation


class RoutingProvider(Protocol):
    async def walking_route(
        self,
        frm: list[float],
        to: list[float],
        *,
        profile: str,
    ) -> RoutingComputation: ...
