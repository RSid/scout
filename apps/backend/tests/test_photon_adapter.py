"""Photon adapter translation tests (DEC-022).

Mocks introduced
----------------
- `respx` stubs outbound HTTPS to the configured Photon base URL so the
  adapter's wire-format translation is exercised offline.
"""

from __future__ import annotations

from urllib.parse import unquote

import httpx
import pytest
import respx

from scout.clients.geocoding.photon import (
    DC_BBOX,
    PhotonProvider,
    _compose_hit_id,
    _compose_hit_label,
)
from scout.clients.geocoding.protocol import AddressHit
from scout.config import Settings
from scout.errors import UpstreamUnavailableError

_BASE = "https://photon.example.invalid"


def _settings() -> Settings:
    return Settings(
        database_url="postgresql+asyncpg://x:x@localhost:1/x",
        geocoding_provider="photon",
        photon_base_url=_BASE,
        photon_user_agent="scout-test/0.0",
    )


def _feature(**props_overrides: object) -> dict[str, object]:
    props: dict[str, object] = {
        "osm_type": "N",
        "osm_id": 51184,
        "name": "Dupont Circle",
        "city": "Washington",
        "state": "District of Columbia",
        "postcode": "20036",
        "country": "United States",
    }
    props.update(props_overrides)
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [-77.0434, 38.9095]},
        "properties": props,
    }


@pytest.mark.asyncio
@respx.mock
async def test_search_translates_features_to_address_hits() -> None:
    respx.get(f"{_BASE}/api").respond(
        200,
        json={"type": "FeatureCollection", "features": [_feature()]},
    )

    async with httpx.AsyncClient() as client:
        adapter = PhotonProvider(settings=_settings(), client=client)
        hits = await adapter.search("dupont", limit=5)

    expected_label = (
        "Dupont Circle, Washington, District of Columbia, 20036, United States"
    )
    assert hits == [
        AddressHit(
            id="photon-N-51184",
            label=expected_label,
            lon=-77.0434,
            lat=38.9095,
        )
    ]


@pytest.mark.asyncio
@respx.mock
async def test_search_sends_dc_bbox_and_capped_limit() -> None:
    route = respx.get(f"{_BASE}/api").respond(
        200, json={"type": "FeatureCollection", "features": []}
    )

    async with httpx.AsyncClient() as client:
        adapter = PhotonProvider(settings=_settings(), client=client)
        # Limit deliberately exceeds the adapter's cap to assert clamping.
        await adapter.search("anywhere", limit=999)

    sent_url = unquote(str(route.calls.last.request.url))
    assert DC_BBOX in sent_url
    assert "limit=10" in sent_url
    assert "lang=en" in sent_url


@pytest.mark.asyncio
async def test_empty_query_short_circuits_without_http() -> None:
    async with httpx.AsyncClient() as client:
        adapter = PhotonProvider(settings=_settings(), client=client)
        assert await adapter.search("   ") == []


@pytest.mark.asyncio
@respx.mock
async def test_upstream_4xx_raises_upstream_unavailable() -> None:
    respx.get(f"{_BASE}/api").respond(503, json={"message": "down"})

    async with httpx.AsyncClient() as client:
        adapter = PhotonProvider(settings=_settings(), client=client)
        with pytest.raises(UpstreamUnavailableError):
            await adapter.search("anywhere")


@pytest.mark.asyncio
@respx.mock
async def test_reverse_returns_first_hit() -> None:
    respx.get(f"{_BASE}/reverse").respond(
        200,
        json={
            "type": "FeatureCollection",
            "features": [_feature(name="National Mall")],
        },
    )

    async with httpx.AsyncClient() as client:
        adapter = PhotonProvider(settings=_settings(), client=client)
        hit = await adapter.reverse(-77.04, 38.89)

    assert hit.label.startswith("National Mall")
    assert hit.lon == pytest.approx(-77.0434)
    assert hit.lat == pytest.approx(38.9095)


@pytest.mark.asyncio
@respx.mock
async def test_reverse_with_no_features_raises() -> None:
    respx.get(f"{_BASE}/reverse").respond(
        200, json={"type": "FeatureCollection", "features": []}
    )

    async with httpx.AsyncClient() as client:
        adapter = PhotonProvider(settings=_settings(), client=client)
        with pytest.raises(UpstreamUnavailableError):
            await adapter.reverse(-77.0, 38.9)


def test_label_combines_housenumber_and_street() -> None:
    props = {
        "housenumber": "1400",
        "street": "U Street Northwest",
        "city": "Washington",
        "country": "United States",
    }
    label = _compose_hit_label(props, lon=-77.0, lat=38.9)

    assert label == "1400 U Street Northwest, Washington, United States"


def test_id_falls_back_to_coordinates_when_osm_metadata_missing() -> None:
    fallback = _compose_hit_id({}, lon=-77.123456, lat=38.987654)

    assert fallback == "photon--77.12346-38.98765"
