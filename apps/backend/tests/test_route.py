"""Contract tests for `POST /api/route`."""

from __future__ import annotations

from typing import Any

import pytest
import respx  # MOCK: stubs ORS; offline-safe cache-hit integration coverage.
from starlette.testclient import TestClient

from scout.api.route import routing_dependency
from scout.clients.routing.constants import FALLBACK_PROFILE_WARNING
from scout.clients.routing.stub import StubRoutingProvider
from scout.config import Settings
from scout.errors import RouteNotFoundError, RouteServiceUnavailableError
from scout.main import app, create_app

_VALID_DC_PAYLOAD = {
    "from": [-77.0, 38.9],
    "to": [-76.92, 38.92],
    "profile": "wheelchair",
}


def _assert_live_region_error(body: dict[str, Any]) -> None:
    err = body["error"]
    assert err["message"] != err["code"]
    assert "<" not in err["message"] and ">" not in err["message"]
    assert err["message"].strip() != ""


def test_route_stub_contract() -> None:
    with TestClient(app) as client:
        resp = client.post("/api/route", json=_VALID_DC_PAYLOAD)
        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "FeatureCollection"
        feature = body["features"][0]
        props = feature["properties"]
        assert props["distance_meters"] == pytest.approx(1200.5)
        assert props["fallback_profile_used"] is False


def test_route_dependency_override_controls_provider_instance() -> None:
    sentinel = StubRoutingProvider()

    with TestClient(app) as client:
        app.dependency_overrides[routing_dependency] = lambda: sentinel
        try:
            resp = client.post("/api/route", json=_VALID_DC_PAYLOAD)
        finally:
            app.dependency_overrides.pop(routing_dependency, None)

    assert resp.status_code == 200


def test_route_live_region_contract_coordinates_outside_dc() -> None:
    payload = dict(_VALID_DC_PAYLOAD)
    payload["from"] = [-80.0, 38.9]

    with TestClient(app) as client:
        resp = client.post("/api/route", json=payload)

    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["code"] == "INVALID_INPUT"
    _assert_live_region_error(body)


def test_route_live_region_contract_missing_destination() -> None:
    with TestClient(app) as client:
        resp = client.post(
            "/api/route",
            json={"from": [-77.0, 38.9], "profile": "wheelchair"},
        )

    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["code"] == "INVALID_INPUT"
    _assert_live_region_error(body)


def test_route_live_region_contract_route_not_found() -> None:
    class RoutingRaisingNotFound:
        async def walking_route(
            self,
            frm: list[float],
            to: list[float],
            *,
            profile: str,
        ) -> object:
            del frm
            del to
            del profile
            raise RouteNotFoundError()

    with TestClient(app) as client:
        app.dependency_overrides[routing_dependency] = lambda: RoutingRaisingNotFound()
        try:
            resp = client.post("/api/route", json=_VALID_DC_PAYLOAD)
        finally:
            app.dependency_overrides.pop(routing_dependency, None)

    assert resp.status_code == 404
    body = resp.json()
    assert body["error"]["code"] == "ROUTE_NOT_FOUND"
    _assert_live_region_error(body)


def test_route_live_region_contract_route_service_unavailable() -> None:
    class RoutingRaisingUpstream:
        async def walking_route(
            self,
            frm: list[float],
            to: list[float],
            *,
            profile: str,
        ) -> object:
            del frm
            del to
            del profile
            raise RouteServiceUnavailableError()

    with TestClient(app) as client:
        app.dependency_overrides[routing_dependency] = lambda: RoutingRaisingUpstream()
        try:
            resp = client.post("/api/route", json=_VALID_DC_PAYLOAD)
        finally:
            app.dependency_overrides.pop(routing_dependency, None)

    assert resp.status_code == 502
    body = resp.json()
    assert body["error"]["code"] == "ROUTE_SERVICE_UNAVAILABLE"
    _assert_live_region_error(body)


def test_route_fallback_warning_round_trips() -> None:
    with TestClient(app) as client:
        app.dependency_overrides[routing_dependency] = lambda: StubRoutingProvider(
            force_fallback=True
        )
        try:
            resp = client.post("/api/route", json=_VALID_DC_PAYLOAD)
        finally:
            app.dependency_overrides.pop(routing_dependency, None)

    assert resp.status_code == 200
    props = resp.json()["features"][0]["properties"]
    assert props["fallback_profile_used"] is True
    assert FALLBACK_PROFILE_WARNING in props["warnings"]


@respx.mock
def test_route_cache_returns_second_response_without_second_ors_request() -> None:
    wheelchair_url = "https://api.openrouteservice.org/v2/directions/wheelchair/geojson"
    route_stub = respx.post(wheelchair_url).respond(
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
                }
            },
        },
    )

    settings = Settings(
        database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
        routing_provider="openrouteservice",
        ors_api_key="unit-route-cache-token",
        ors_base_url="https://api.openrouteservice.org",
        cors_allowlist_csv="",
    )
    routed_app = create_app(settings)
    with TestClient(routed_app) as client:
        resp_a = client.post("/api/route", json=_VALID_DC_PAYLOAD)
        resp_b = client.post("/api/route", json=_VALID_DC_PAYLOAD)

    assert resp_a.status_code == 200
    assert resp_b.status_code == 200
    assert resp_a.json()["features"][0]["properties"]["distance_meters"] == (
        pytest.approx(987.65)
    )
    assert route_stub.call_count == 1
