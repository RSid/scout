"""Adapter-level regression for OpenRouteService JSON translation."""

from __future__ import annotations

import pytest
import respx  # MOCK: stubs outbound HTTPS for ORS to keep tests offline-safe.
from httpx import AsyncClient

from scout.clients.routing.openrouteservice import OpenRouteServiceProvider
from scout.config import Settings


@pytest.mark.asyncio
@respx.mock
async def test_openrouteservice_adapter_success() -> None:
    wheelchair_url = "https://api.openrouteservice.org/v2/directions/wheelchair/geojson"
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
        ors_base_url="https://api.openrouteservice.org",
        cors_allowlist_csv="",
    )

    async with AsyncClient(base_url="https://scout.test") as client:
        adapter = OpenRouteServiceProvider(settings=settings, client=client)
        result = await adapter.walking_wheelchair_route([-77.0, 38.9], [-76.9, 39.0])

        assert result.fallback_profile_used is False
        assert result.distance_meters == pytest.approx(987.65)
        assert result.duration_seconds == pytest.approx(654.321)
        assert "demo" in result.warnings


@pytest.mark.asyncio
@respx.mock
async def test_openrouteservice_adapter_fallback() -> None:
    wheelchair_url = "https://api.openrouteservice.org/v2/directions/wheelchair/geojson"
    foot_url = "https://api.openrouteservice.org/v2/directions/foot-walking/geojson"
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
        ors_base_url="https://api.openrouteservice.org",
        cors_allowlist_csv="",
    )

    async with AsyncClient(base_url="https://scout.test") as client:
        adapter = OpenRouteServiceProvider(settings=settings, client=client)
        result = await adapter.walking_wheelchair_route([-77.0, 38.9], [-76.9, 39.0])
        assert result.fallback_profile_used is True
