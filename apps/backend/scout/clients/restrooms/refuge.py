"""Refuge Restrooms adapter (DEC-020).

Owns the Refuge Restrooms API contract: it pages the ``by_location`` endpoint
around the DC centroid (the API takes ``lat``/``lng``, not a bbox), keeps the
DC result set in a 24h in-process TTL cache, and hands Scout-domain
``Restroom`` objects to callers. Normalisation into the ``Feature`` shape lives
in ``normalize.py`` so every consumer inherits the same sanitisation.

No PG row is written for restrooms by design (appendix-data-schema.md B.8): the
cache is the source of truth. If rate-limit pressure ever appears, this adapter
can be backed by a ``restroom_cache`` table without changing call sites.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

import httpx

from scout.clients.restrooms.protocol import RestroomsProvider
from scout.clients.restrooms.types import Bbox, Restroom
from scout.config import Settings
from scout.errors import RestroomsUpstreamUnavailableError

LOGGER = logging.getLogger("scout")

# DC service area (mirrors the bounds enforced in schema.py).
DC_BBOX = Bbox(west=-77.12, south=38.79, east=-76.91, north=39.0)
_DC_CENTROID_LAT = (DC_BBOX.south + DC_BBOX.north) / 2
_DC_CENTROID_LNG = (DC_BBOX.west + DC_BBOX.east) / 2

_CACHE_TTL_SECONDS = 24 * 60 * 60
_PER_PAGE = 100
_MAX_PAGES = 20
_REQUEST_TIMEOUT = 10.0


def _opt_str(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _vendor_record_to_restroom(record: dict[str, Any]) -> Restroom | None:
    """Translate one Refuge JSON record into a ``Restroom`` (or skip it)."""

    try:
        lng = float(record["longitude"])
        lat = float(record["latitude"])
    except (KeyError, TypeError, ValueError):
        return None

    api_id = _opt_str(record.get("id")) or f"{lng:.5f}-{lat:.5f}"
    return Restroom(
        api_id=api_id,
        name=_opt_str(record.get("name")),
        street=_opt_str(record.get("street")),
        city=_opt_str(record.get("city")),
        state=_opt_str(record.get("state")),
        accessible=bool(record.get("accessible")),
        unisex=bool(record.get("unisex")),
        changing_table=bool(record.get("changing_table")),
        directions=_opt_str(record.get("directions")),
        comment=_opt_str(record.get("comment")),
        lat=lat,
        lng=lng,
        updated_at=_opt_str(record.get("updated_at")),
    )


class RefugeRestroomsProvider(RestroomsProvider):
    def __init__(self, *, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client
        self._cache: list[Restroom] | None = None
        self._deadline = 0.0
        self._lock = asyncio.Lock()

    async def list_in_bbox(self, bbox: Bbox) -> list[Restroom]:
        restrooms = await self._dc_restrooms()
        return [r for r in restrooms if bbox.contains(r.lng, r.lat)]

    async def _dc_restrooms(self) -> list[Restroom]:
        """Return the cached DC set, refreshing from upstream when stale."""

        if self._cache is not None and time.monotonic() < self._deadline:
            return self._cache

        async with self._lock:
            # Re-check after acquiring the lock: another request may have just
            # refreshed the cache while we waited.
            if self._cache is not None and time.monotonic() < self._deadline:
                return self._cache
            try:
                fetched = await self._fetch_dc()
            except httpx.HTTPError as exc:
                if self._cache is not None:
                    LOGGER.warning(
                        "restrooms upstream=refuge outcome=serve_stale cached=%d",
                        len(self._cache),
                    )
                    return self._cache
                LOGGER.warning("restrooms upstream=refuge outcome=unavailable cached=0")
                raise RestroomsUpstreamUnavailableError() from exc
            self._cache = fetched
            self._deadline = time.monotonic() + _CACHE_TTL_SECONDS
            return fetched

    async def _fetch_dc(self) -> list[Restroom]:
        """Page ``by_location`` around the DC centroid; dedupe + DC-filter."""

        collected: dict[str, Restroom] = {}
        for page in range(1, _MAX_PAGES + 1):
            records = await self._fetch_page(page)
            if not records:
                break
            dc_hits = 0
            for record in records:
                if not isinstance(record, dict):
                    continue
                restroom = _vendor_record_to_restroom(record)
                if restroom is None:
                    continue
                if DC_BBOX.contains(restroom.lng, restroom.lat):
                    collected[restroom.api_id] = restroom
                    dc_hits += 1
            # Results come back ordered by distance from the centroid, so once
            # a whole page lands outside DC we have left the service area.
            if dc_hits == 0:
                break
        LOGGER.info(
            "restrooms upstream=refuge outcome=refresh count=%d", len(collected)
        )
        return list(collected.values())

    async def _fetch_page(self, page: int) -> list[Any]:
        url = f"{self._settings.refuge_base_url.rstrip('/')}/restrooms/by_location"
        params: dict[str, str | int | float] = {
            "lat": _DC_CENTROID_LAT,
            "lng": _DC_CENTROID_LNG,
            "ada": "true",
            "per_page": _PER_PAGE,
            "page": page,
        }
        resp = await self._client.get(url, params=params, timeout=_REQUEST_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        return data if isinstance(data, list) else []
