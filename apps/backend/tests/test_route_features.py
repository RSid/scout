"""Tests for `/api/route-features` scaffolding."""

from __future__ import annotations

from typing import Any

import pytest
from starlette.testclient import TestClient

from scout.api import route_features as route_features_module
from scout.main import app


def test_route_features_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    # MOCK: short-circuit PostGIS retrieval so CI stays offline-first.
    async def _stub_corridor(
        session: Any, **kwargs: Any
    ) -> tuple[list[dict[str, Any]], float, bool]:  # noqa: ARG001
        del kwargs
        feats = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-77.0369, 38.9072]},
                "properties": {
                    "id": "fixture:point",
                    "category": "curb_ramps",
                    "kind": "obstacle",
                    "condition": "Good",
                    "condition_normalized": "good",
                    "inspected_year": 2020,
                    "source_dataset": "fixture",
                    "source_id": "1",
                    "attributes": {},
                },
            }
        ]
        return feats, 12.34, False

    monkeypatch.setattr(
        route_features_module, "corridor_features_geojson", _stub_corridor
    )

    payload = {
        "route_geometry": {
            "type": "LineString",
            "coordinates": [[-77.1, 38.9], [-77.0, 39.0]],
        },
        "buffer_meters": 30,
        "categories": ["curb_ramps"],
    }

    with TestClient(app) as client:
        resp = client.post("/api/route-features", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        assert body["features"][0]["properties"]["category"] == "curb_ramps"
        assert body["meta"]["truncated"] is False
