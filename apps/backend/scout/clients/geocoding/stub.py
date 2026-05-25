"""Offline stub geocoder — deterministic hits for tests and stubbed dev."""

from __future__ import annotations

from scout.clients.geocoding.protocol import AddressHit, GeocodingProvider

_STUB_HITS: tuple[AddressHit, ...] = (
    AddressHit(
        id="stub-14th-u",
        label="1400 U Street Northwest, Washington, DC 20009, United States",
        lon=-77.0366,
        lat=38.9169,
    ),
    AddressHit(
        id="stub-dupont",
        label="Dupont Circle, Washington, District of Columbia 20009, United States",
        lon=-77.0369,
        lat=38.9097,
    ),
)


class StubGeocodingProvider(GeocodingProvider):
    async def search(self, query: str, *, limit: int = 5) -> list[AddressHit]:
        trimmed = query.strip().lower()
        if not trimmed:
            return []
        if "dupont" in trimmed or "14th" in trimmed or "14 " in trimmed:
            return list(_STUB_HITS[:limit])
        return [_STUB_HITS[0]] if limit >= 1 else []

    async def reverse(self, lon: float, lat: float) -> AddressHit:
        # Deliberately a non-address label so a developer who clicks
        # "Use my location" against this stub can't mistake it for a
        # real reverse-geocode result.
        return AddressHit(
            id="stub-reverse",
            label=(
                "[STUB] Reverse-geocode fixture — "
                "override SCOUT_GEOCODING_PROVIDER for a live-backed dev stack"
            ),
            lon=lon,
            lat=lat,
        )
