"""Contract tests for `POST /api/route`."""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from scout.main import app


def test_route_stub_contract() -> None:
    payload = {"from": [-77.0, 38.9], "to": [-76.9, 38.92], "profile": "wheelchair"}
    with TestClient(app) as client:
        resp = client.post("/api/route", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "FeatureCollection"
        feature = body["features"][0]
        props = feature["properties"]
        assert props["distance_meters"] == pytest.approx(1200.5)
        assert props["fallback_profile_used"] is False
