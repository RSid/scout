"""Adapter-level regression for OpenRouteService JSON translation."""

from __future__ import annotations

import httpx
import pytest
import respx  # MOCK: stubs outbound HTTPS for ORS to keep tests offline-safe.

from scout.clients.routing.constants import FALLBACK_PROFILE_WARNING
from scout.clients.routing.openrouteservice import (
    OpenRouteServiceProvider,
    routing_cache_key,
)
from scout.config import Settings
from scout.errors import RouteNotFoundError, RouteServiceUnavailableError


@pytest.mark.asyncio
@respx.mock
async def test_openrouteservice_adapter_success() -> None:
    wheelchair_url = (
        "https://api.heigit.org/openrouteservice/v2/directions/wheelchair/geojson"
    )
    respx.post(wheelchair_url).respond(
        200,
        json={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"coordinates": [], "type": "LineString"},
                    "properties": {},
                }
            ],
            "metadata": {
                "summary": {
                    "distance": 987.65,
                    "duration": 654.321,
                    "warnings": ["demo"],
                }
            },
        },
    )

    settings = Settings(
        database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
        routing_provider="openrouteservice",
        ors_api_key="unit-test-token",
        ors_base_url="https://api.heigit.org/openrouteservice",
        cors_allowlist_csv="",
    )

    async with httpx.AsyncClient(base_url="https://scout.test") as client:
        adapter = OpenRouteServiceProvider(settings=settings, client=client)
        result = await adapter.walking_route(
            [-77.0, 38.9], [-76.92, 39.0], profile="wheelchair"
        )

        assert result.fallback_profile_used is False
        assert result.distance_meters == pytest.approx(987.65)
        assert result.duration_seconds == pytest.approx(654.321)
        assert "demo" in result.warnings


@pytest.mark.asyncio
@respx.mock
async def test_openrouteservice_adapter_reads_feature_property_summary() -> None:
    """Real ORS v2 directions/<profile>/geojson puts
    summary on features[0].properties."""

    wheelchair_url = (
        "https://api.heigit.org/openrouteservice/v2/directions/wheelchair/geojson"
    )
    respx.post(wheelchair_url).respond(
        200,
        json={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {
                        "coordinates": [[-77.0, 38.9], [-76.92, 39.0]],
                        "type": "LineString",
                    },
                    "properties": {
                        "way_points": [0, 1],
                        "summary": {"distance": 829.0, "duration": 565.4},
                    },
                }
            ],
            "metadata": {"engine": {"version": "9.x"}},
        },
    )

    settings = Settings(
        database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
        routing_provider="openrouteservice",
        ors_api_key="unit-test-token",
        ors_base_url="https://api.heigit.org/openrouteservice",
        cors_allowlist_csv="",
    )

    async with httpx.AsyncClient(base_url="https://scout.test") as client:
        adapter = OpenRouteServiceProvider(settings=settings, client=client)
        result = await adapter.walking_route(
            [-77.0, 38.9], [-76.92, 39.0], profile="wheelchair"
        )

        assert result.distance_meters == pytest.approx(829.0)
        assert result.duration_seconds == pytest.approx(565.4)


@pytest.mark.asyncio
@respx.mock
async def test_openrouteservice_adapter_fallback() -> None:
    wheelchair_url = (
        "https://api.heigit.org/openrouteservice/v2/directions/wheelchair/geojson"
    )
    foot_url = (
        "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson"
    )
    respx.post(wheelchair_url).respond(404)
    respx.post(foot_url).respond(
        200,
        json={
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": {"coordinates": [], "type": "LineString"},
                    "properties": {},
                }
            ],
            "properties": {"summary": {"distance": 100.0, "duration": 200.0}},
        },
    )

    settings = Settings(
        database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
        routing_provider="openrouteservice",
        ors_api_key="token",
        ors_base_url="https://api.heigit.org/openrouteservice",
        cors_allowlist_csv="",
    )

    async with httpx.AsyncClient(base_url="https://scout.test") as client:
        adapter = OpenRouteServiceProvider(settings=settings, client=client)
        result = await adapter.walking_route(
            [-77.0, 38.9], [-76.92, 39.0], profile="wheelchair"
        )

        assert result.fallback_profile_used is True
        assert FALLBACK_PROFILE_WARNING in result.warnings


def test_openrouteservice_routing_cache_keys_differ_across_profiles() -> None:
    coords = [-77.0, 38.9, -76.92, 39.0]

    assert routing_cache_key("wheelchair", coords) != routing_cache_key(
        "foot-walking",
        coords,
    )


@pytest.mark.asyncio
@respx.mock
async def test_openrouteservice_connect_timeout_is_route_unavailable() -> None:
    wheelchair_url = (
        "https://api.heigit.org/openrouteservice/v2/directions/wheelchair/geojson"
    )
    respx.post(wheelchair_url).mock(side_effect=httpx.ConnectTimeout("timeout"))

    settings = Settings(
        database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
        routing_provider="openrouteservice",
        ors_api_key="unit-test-token",
        ors_base_url="https://api.heigit.org/openrouteservice",
        cors_allowlist_csv="",
    )

    async with httpx.AsyncClient(base_url="https://scout.test") as client:
        adapter = OpenRouteServiceProvider(settings=settings, client=client)
        with pytest.raises(RouteServiceUnavailableError):
            await adapter.walking_route(
                [-77.0, 38.9], [-76.92, 39.0], profile="wheelchair"
            )


@pytest.mark.asyncio
@respx.mock
async def test_openrouteservice_rate_limit_is_route_unavailable() -> None:
    wheelchair_url = (
        "https://api.heigit.org/openrouteservice/v2/directions/wheelchair/geojson"
    )
    respx.post(wheelchair_url).respond(429)

    settings = Settings(
        database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
        routing_provider="openrouteservice",
        ors_api_key="unit-test-token",
        ors_base_url="https://api.heigit.org/openrouteservice",
        cors_allowlist_csv="",
    )

    async with httpx.AsyncClient(base_url="https://scout.test") as client:
        adapter = OpenRouteServiceProvider(settings=settings, client=client)
        with pytest.raises(RouteServiceUnavailableError):
            await adapter.walking_route(
                [-77.0, 38.9], [-76.92, 39.0], profile="wheelchair"
            )


@pytest.mark.asyncio
@respx.mock
async def test_openrouteservice_both_profiles_404_raises_not_found() -> None:
    wheelchair_url = (
        "https://api.heigit.org/openrouteservice/v2/directions/wheelchair/geojson"
    )
    foot_url = (
        "https://api.heigit.org/openrouteservice/v2/directions/foot-walking/geojson"
    )
    respx.post(wheelchair_url).respond(404)
    respx.post(foot_url).respond(404)

    settings = Settings(
        database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
        routing_provider="openrouteservice",
        ors_api_key="token",
        ors_base_url="https://api.heigit.org/openrouteservice",
        cors_allowlist_csv="",
    )

    async with httpx.AsyncClient(base_url="https://scout.test") as client:
        adapter = OpenRouteServiceProvider(settings=settings, client=client)
        with pytest.raises(RouteNotFoundError):
            await adapter.walking_route(
                [-77.0, 38.9], [-76.92, 39.0], profile="wheelchair"
            )
