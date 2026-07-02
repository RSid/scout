"""Local bundled DC MAR autocomplete (M1-F03, DEC-023; DEC-026 named places).

Reads only from the Postgres `dc_addresses` / `dc_points_of_interest` tables
populated by ``scripts/ingest_dc_addresses.py`` /
``scripts/ingest_dc_points_of_interest.py``. No upstream HTTP at request time.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from scout.clients.geocoding.protocol import AddressHit, GeocodingProvider
from scout.data.region import DC_BBOX_LON_LAT
from scout.data.store import reverse_dc_nearest_row, search_dc_addresses
from scout.errors import UpstreamUnavailableError

_MAX_LIMIT = 10


def _in_dc_bbox(*, lon: float, lat: float) -> bool:
    west, south, east, north = DC_BBOX_LON_LAT
    return west <= lon <= east and south <= lat <= north


class LocalDcGeocodingProvider(GeocodingProvider):
    """MAR-backed geocoder backed by PostGIS rows (no external HTTP)."""

    __slots__ = ("_session",)

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def search(self, query: str, *, limit: int = 5) -> list[AddressHit]:
        trimmed = query.strip()
        if not trimmed:
            return []
        capped_limit = max(1, min(limit, _MAX_LIMIT))
        rows = await search_dc_addresses(self._session, trimmed, limit=capped_limit)
        return [
            AddressHit(id=row.id, label=row.label_full, lon=row.lon, lat=row.lat)
            for row in rows
        ]

    async def reverse(self, lon: float, lat: float) -> AddressHit:
        if not _in_dc_bbox(lon=lon, lat=lat):
            raise UpstreamUnavailableError(
                message="Reverse geocoding is limited to Washington, DC.",
            )
        row = await reverse_dc_nearest_row(self._session, lon, lat)
        if row is None:
            raise UpstreamUnavailableError(message="No reverse geocode result.")
        return AddressHit(id=row.id, label=row.label_full, lon=row.lon, lat=row.lat)
