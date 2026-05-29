"""Tests for `POST /api/route-features`."""

from __future__ import annotations

import os
from typing import Any

import pytest
from starlette.testclient import TestClient

from scout.api import route_features as route_features_module
from scout.data.schema import CorridorResponse
from scout.main import app

_VALID_LINE = {"type": "LineString", "coordinates": [[-77.1, 38.9], [-77.0, 39.0]]}


def test_route_features_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    # MOCK: short-circuit PostGIS retrieval so CI stays offline-first.
    async def _stub_corridor(
        session: Any,
        **kwargs: Any,  # noqa: ARG001
    ) -> tuple[list[dict[str, Any]], float, bool, int]:
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
                    "along_route_meters": 140.6,
                },
            }
        ]
        return feats, 12.34, False, 1

    monkeypatch.setattr(
        route_features_module, "corridor_features_geojson", _stub_corridor
    )

    payload = {
        "route_geometry": _VALID_LINE,
        "buffer_meters": 30,
        "categories": ["curb_ramps"],
    }

    with TestClient(app) as client:
        resp = client.post("/api/route-features", json=payload)
        assert resp.status_code == 200
        body = resp.json()
        # The strongest contract assertion: the wire payload round-trips through
        # the declared response model (extra="forbid" rejects drift in either
        # direction). This also pins the GeoJSON envelope + `meta` extension.
        CorridorResponse.model_validate(body)
        assert body["type"] == "FeatureCollection"
        assert body["meta"]["time_taken_ms"] == 12.34
        props = body["features"][0]["properties"]
        assert props["category"] == "curb_ramps"
        assert props["along_route_meters"] == 140.6
        assert body["meta"]["truncated"] is False
        assert body["meta"]["feature_count_total"] == 1


def test_route_features_response_carries_every_appendix_field(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """M1-F07 S6: each feature exposes the normalized appendix §A fields."""

    # MOCK: short-circuit PostGIS retrieval so CI stays offline-first.
    async def _stub(
        session: Any,
        **_kwargs: Any,  # noqa: ARG001
    ) -> tuple[list[dict[str, Any]], float, bool, int]:
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
                    "along_route_meters": 140.6,
                },
            }
        ]
        return feats, 1.0, False, 1

    monkeypatch.setattr(route_features_module, "corridor_features_geojson", _stub)

    with TestClient(app) as client:
        resp = client.post(
            "/api/route-features",
            json={
                "route_geometry": _VALID_LINE,
                "buffer_meters": 30,
                "categories": ["curb_ramps"],
            },
        )

    props = resp.json()["features"][0]["properties"]
    appendix_keys = (
        "id",
        "category",
        "kind",
        "condition",
        "condition_normalized",
        "inspected_year",
        "source_dataset",
        "source_id",
        "attributes",
        "along_route_meters",
    )
    assert all(key in props for key in appendix_keys)


def test_route_features_buffer_too_large() -> None:
    payload = {
        "route_geometry": _VALID_LINE,
        "buffer_meters": 201,
        "categories": ["curb_ramps"],
    }
    with TestClient(app) as client:
        resp = client.post("/api/route-features", json=payload)
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["code"] == "BUFFER_TOO_LARGE"


def test_route_features_unknown_category() -> None:
    payload = {
        "route_geometry": _VALID_LINE,
        "buffer_meters": 30,
        "categories": ["curb_ramps", "banana_stand"],
    }
    with TestClient(app) as client:
        resp = client.post("/api/route-features", json=payload)
    assert resp.status_code == 400
    body = resp.json()
    assert body["error"]["code"] == "UNKNOWN_CATEGORY"
    assert "banana_stand" in body["error"]["message"]


def test_route_features_truncated_meta_reflects_uncapped_total(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # MOCK: return one row truncated + total would be huge.
    async def _stub(
        session: Any,
        **_kwargs: Any,  # noqa: ARG001
    ) -> tuple[list[dict[str, Any]], float, bool, int]:
        feats = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-77.0369, 38.9072]},
                "properties": {
                    "id": "fixture:trunc",
                    "category": "curb_ramps",
                    "kind": "obstacle",
                    "condition": None,
                    "condition_normalized": "mild",
                    "inspected_year": None,
                    "source_dataset": "fixture",
                    "source_id": "2",
                    "attributes": {},
                    "along_route_meters": 0.0,
                },
            },
        ]
        return feats, 5.5, True, 9_012

    monkeypatch.setattr(route_features_module, "corridor_features_geojson", _stub)

    with TestClient(app) as client:
        resp = client.post(
            "/api/route-features",
            json={
                "route_geometry": _VALID_LINE,
                "buffer_meters": 30,
                "categories": ["curb_ramps"],
            },
        )

    assert resp.status_code == 200
    data = resp.json()
    assert data["meta"]["truncated"] is True
    assert data["meta"]["feature_count_total"] == 9_012
    # S6: a missing inspection year serializes as JSON `null` exactly — never 0,
    # never omitted — so the FE can render "Inspection date unknown".
    props = data["features"][0]["properties"]
    assert "inspected_year" in props and props["inspected_year"] is None


@pytest.mark.integration
@pytest.mark.skipif(
    not os.getenv("SCOUT_RUN_PG_TESTS"),
    reason="Set SCOUT_RUN_PG_TESTS=1 and a seeded PostGIS DB to "
    + "exercise real corridor SQL.",
)
def test_route_features_live_postgis_smoke() -> None:
    """Optional local ingest smoke: verifies along_route_meters
    survives the pipeline."""

    payload = {
        "route_geometry": _VALID_LINE,
        "buffer_meters": 30,
        "categories": ["curb_ramps"],
    }
    with TestClient(app) as client:
        resp = client.post("/api/route-features", json=payload)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert isinstance(body["meta"]["feature_count_total"], int)
    for feat in body["features"]:
        assert "along_route_meters" in feat["properties"]
