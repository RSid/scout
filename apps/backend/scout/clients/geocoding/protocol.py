"""Geocoder protocol and Scout-domain result type (DEC-020, DEC-022).

Adapters speak Scout-domain `AddressHit` upward; vendor wire shapes stop at the
adapter boundary.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True, slots=True)
class AddressHit:
    """A geocoder result, in Scout-domain terms.

    Mirrors the frontend `AddressHit` shape in
    `apps/web/lib/providers/geocoding/protocol.ts` so the API contract is
    symmetric on both sides of the wire.
    """

    id: str
    label: str
    lon: float
    lat: float


class GeocodingProvider(Protocol):
    """Use-case-shaped interface; implementations live in sibling modules."""

    async def search(self, query: str, *, limit: int = 5) -> list[AddressHit]: ...

    async def reverse(self, lon: float, lat: float) -> AddressHit: ...
