"""Per-route IP rate limiting (M1-T17).

Mocks introduced
----------------
- ``MagicMock`` stand-ins for starlette Request on ``scout_key_func`` —
  controls ``headers`` / ``client`` / ``settings`` without full ASGI scopes.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest
from starlette.datastructures import Headers
from starlette.testclient import TestClient

from scout.api import route_features as route_features_module
from scout.config import Settings
from scout.main import app, create_app
from scout.security.rate_limit import limiter, scout_key_func

_ROUTE_PAYLOAD = {"from": [-77.0, 38.9], "to": [-76.9, 38.92], "profile": "wheelchair"}
_FEATURES_PAYLOAD = {
    "route_geometry": {
        "type": "LineString",
        "coordinates": [[-77.1, 38.9], [-77.0, 39.0]],
    },
    "buffer_meters": 30,
    "categories": ["curb_ramps"],
}
_BBOX = "-77.1,38.85,-76.95,39.05"


@pytest.fixture(autouse=True)
def _isolate_rate_buckets() -> None:
    """Clear memory backend + sane defaults — tests toggle ``limiter.enabled``."""

    limiter.reset()
    limiter.enabled = True
    yield
    limiter.reset()
    limiter.enabled = True


def test_route_rate_limit() -> None:
    with TestClient(app) as client:
        for _ in range(30):
            assert client.post("/api/route", json=_ROUTE_PAYLOAD).status_code == 200
        resp = client.post("/api/route", json=_ROUTE_PAYLOAD)
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "RATE_LIMIT"
    assert "Retry-After" in resp.headers


def test_route_features_rate_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _stub_corridor(
        session: Any,
        **_kwargs: Any,
    ) -> tuple[list[dict[str, Any]], float, bool]:
        del session
        return [], 1.0, False

    monkeypatch.setattr(
        route_features_module, "corridor_features_geojson", _stub_corridor
    )

    with TestClient(app) as client:
        for _ in range(30):
            resp = client.post("/api/route-features", json=_FEATURES_PAYLOAD)
            assert resp.status_code == 200, resp.text
        resp = client.post("/api/route-features", json=_FEATURES_PAYLOAD)
    assert resp.status_code == 429


def test_restrooms_rate_limit() -> None:
    with TestClient(app) as client:
        for _ in range(60):
            assert (
                client.get("/api/restrooms", params={"bbox": _BBOX}).status_code == 200
            )
        resp = client.get("/api/restrooms", params={"bbox": _BBOX})
    assert resp.status_code == 429


def test_geocode_search_rate_limit() -> None:
    with TestClient(app) as client:
        for _ in range(30):
            r = client.get("/api/geocode/search", params={"q": "Dupont"})
            assert r.status_code == 200, r.text
        resp = client.get("/api/geocode/search", params={"q": "Dupont"})
    assert resp.status_code == 429
    assert resp.json()["error"]["code"] == "RATE_LIMIT"


def test_health_exempt_under_load(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fast_probe(session: Any) -> tuple[bool, int | None]:  # noqa: ARG001
        return True, 0

    monkeypatch.setattr("scout.api.health._probe_features_table", _fast_probe)

    with TestClient(app) as client:
        for _ in range(200):
            r = client.get("/api/health")
            assert r.status_code != 429
            assert r.status_code == 200


@pytest.mark.parametrize(
    ("configured_header", "header_value"),
    [
        ("X-Forwarded-For", "203.0.113.88, 10.2.3.4"),
        ("Cf-Connecting-IP", "198.51.100.99"),
        ("Fly-Client-IP", "192.0.2.12"),
    ],
)
def test_ip_header_selected_when_proxy_trusted(
    configured_header: str, header_value: str
) -> None:
    # MOCK: Request stand-in isolates scout_key_func from ASGI plumbing.
    req = MagicMock()
    req.headers = Headers({configured_header: header_value})
    settings = Settings(
        database_url="postgresql+asyncpg://x:x@localhost:1/x",
        trust_proxy_headers=True,
        client_ip_header=configured_header,
    )

    req.app.state.settings = settings
    req.client = MagicMock()
    req.client.host = "10.0.0.1"

    ip = scout_key_func(req)

    assert ip == header_value.split(",")[0].strip()


@pytest.mark.parametrize("configured_header", ("Cf-Connecting-IP", "Fly-Client-IP"))
def test_ip_header_ignored_when_proxy_untrusted(configured_header: str) -> None:
    # MOCK: Request stand-in isolates scout_key_func from ASGI plumbing.
    req = MagicMock()
    req.app.state.settings = Settings(
        database_url="postgresql+asyncpg://x:x@localhost:1/x",
        trust_proxy_headers=False,
        client_ip_header=configured_header,
    )
    req.client = MagicMock()
    req.client.host = "10.1.2.99"

    assert scout_key_func(req) == "10.1.2.99"


def test_create_app_when_rate_disabled() -> None:
    tuned = Settings(
        routing_provider="stub",
        restrooms_provider="stub",
        geocoding_provider="stub",
        rate_limit_enabled=False,
    )

    lax = create_app(tuned)
    assert lax.state.limiter.enabled is False
