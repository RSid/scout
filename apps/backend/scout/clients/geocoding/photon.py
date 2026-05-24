"""Photon adapter (DEC-022).

Photon is an OSM-backed geocoder built for autocomplete by Komoot. We hit
its REST API (`/api` for forward search, `/reverse` for reverse) and
translate the GeoJSON `Feature` payload to Scout-domain `AddressHit`s at
the adapter boundary.

The chosen upstream is configurable via `SCOUT_PHOTON_BASE_URL`. In dev
and at M1 soft-launch it defaults to `https://photon.komoot.io` (the
upstream's community endpoint); a follow-up PR brings up a self-hosted
Photon on Fly with a DC-scoped index and flips the env var. The
application code is unchanged in either case.
"""

from __future__ import annotations

from typing import Any

import httpx

from scout.clients.geocoding.protocol import AddressHit, GeocodingProvider
from scout.config import Settings
from scout.errors import UpstreamUnavailableError

# Rough Washington, DC bounding box (west, south, east, north).
# Photon `bbox` filters results to this box; the same coords appear on
# the frontend stub for parity.
DC_BBOX = "-77.119,38.792,-76.909,38.996"

_MAX_LIMIT = 10
_HTTP_TIMEOUT_SECONDS = 5.0


class PhotonProvider(GeocodingProvider):
    def __init__(self, *, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client

    async def search(self, query: str, *, limit: int = 5) -> list[AddressHit]:
        trimmed = query.strip()
        if not trimmed:
            return []
        capped_limit = max(1, min(limit, _MAX_LIMIT))
        params: dict[str, str | int] = {
            "q": trimmed,
            "limit": capped_limit,
            "lang": "en",
            "bbox": DC_BBOX,
        }
        return await self._fetch_features("/api", params)

    async def reverse(self, lon: float, lat: float) -> AddressHit:
        params: dict[str, str | float] = {"lon": lon, "lat": lat, "lang": "en"}
        hits = await self._fetch_features("/reverse", params)
        if not hits:
            raise UpstreamUnavailableError(message="No reverse geocode result.")
        return hits[0]

    async def _fetch_features(
        self, path: str, params: dict[str, Any]
    ) -> list[AddressHit]:
        url = f"{self._settings.photon_base_url.rstrip('/')}{path}"
        headers = {"User-Agent": self._settings.photon_user_agent}
        try:
            resp = await self._client.get(
                url,
                params=params,
                headers=headers,
                timeout=_HTTP_TIMEOUT_SECONDS,
            )
        except httpx.HTTPError as exc:
            raise UpstreamUnavailableError(
                message="Geocoding service unreachable."
            ) from exc
        if resp.status_code >= 400:
            raise UpstreamUnavailableError()
        return _photon_payload_to_hits(resp.json())


def _photon_payload_to_hits(body: object) -> list[AddressHit]:
    if not isinstance(body, dict):
        return []
    raw_features = body.get("features")
    if not isinstance(raw_features, list):
        return []
    hits: list[AddressHit] = []
    for feat in raw_features:
        hit = _photon_feature_to_hit(feat)
        if hit is not None:
            hits.append(hit)
    return hits


def _photon_feature_to_hit(feature: object) -> AddressHit | None:
    if not isinstance(feature, dict):
        return None
    geometry = feature.get("geometry")
    if not isinstance(geometry, dict):
        return None
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2:
        return None
    try:
        lon = float(coords[0])
        lat = float(coords[1])
    except (TypeError, ValueError):
        return None
    props_raw = feature.get("properties")
    props: dict[str, Any] = props_raw if isinstance(props_raw, dict) else {}
    return AddressHit(
        id=_compose_hit_id(props, lon, lat),
        label=_compose_hit_label(props, lon, lat),
        lon=lon,
        lat=lat,
    )


def _compose_hit_id(props: dict[str, Any], lon: float, lat: float) -> str:
    """Stable id for keyboard-selection in the frontend combobox.

    Prefer OSM identity (`{type}-{id}` is unique across the OSM planet);
    fall back to coordinates when Photon omits the OSM ids on a synthetic
    record (rare, but observed in dev fixtures).
    """

    osm_type = props.get("osm_type")
    osm_id = props.get("osm_id")
    if isinstance(osm_type, str) and isinstance(osm_id, (int, str)):
        return f"photon-{osm_type}-{osm_id}"
    return f"photon-{lon:.5f}-{lat:.5f}"


def _compose_hit_label(props: dict[str, Any], lon: float, lat: float) -> str:
    """Build the human-readable suggestion text.

    Photon does not return a pre-formatted `display_name` (Nominatim
    does); we assemble one from the most useful fields. Order chosen so
    that named places (Dupont Circle) and street addresses (1400 U St)
    both read naturally.
    """

    name = _str_or_none(props.get("name"))
    housenumber = _str_or_none(props.get("housenumber"))
    street = _str_or_none(props.get("street"))

    address_line: str | None = None
    if street and housenumber:
        address_line = f"{housenumber} {street}"
    elif street:
        address_line = street

    pieces: list[str] = []
    if name and (address_line is None or name not in address_line):
        pieces.append(name)
    if address_line:
        pieces.append(address_line)
    for key in ("city", "state", "postcode", "country"):
        val = _str_or_none(props.get(key))
        if val:
            pieces.append(val)
    if pieces:
        return ", ".join(pieces)
    return f"{lon:.4f}\u00b0, {lat:.4f}\u00b0"


def _str_or_none(value: object) -> str | None:
    return value if isinstance(value, str) and value.strip() else None
