"""Tests for restroom proxy scaffolding."""

from __future__ import annotations

from starlette.testclient import TestClient

from scout.main import app


def test_restrooms_returns_collection() -> None:
    bbox = "-77.1,38.85,-76.95,39.05"
    with TestClient(app) as client:
        resp = client.get("/api/restrooms", params={"bbox": bbox})
        assert resp.status_code == 200
        body = resp.json()
        assert body["type"] == "FeatureCollection"
        assert body["features"] == []
