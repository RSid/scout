"""Tests for `POST /api/route-features`."""

from __future__ import annotations

import os
from typing import Any

import pytest
from starlette.testclient import TestClient

from scout.api import route_features as route_features_module
from scout.api.restrooms import restrooms_dependency
from scout.clients.restrooms.types import Bbox, Restroom
from scout.main import app

_VALID_LINE = {"type": "LineString", "coordinates": [[-77.1, 38.9], [-77.0, 39.0]]}


class _FakeRestroomsProvider:
    """Returns a fixed restroom set and records whether it was queried."""

    def __init__(self, restrooms: list[Restroom]) -> None:
        self._restrooms = restrooms
        self.called = False

    async def list_in_bbox(self, bbox: Bbox) -> list[Restroom]:
        del bbox
        self.called = True
        return self._restrooms


def _restroom_at(api_id: str, lng: float, lat: float) -> Restroom:
    return Restroom(
        api_id=api_id,
        name="R",
        street=None,
        city=None,
        state=None,
        accessible=True,
        unisex=False,
        changing_table=False,
        directions=None,
        comment=None,
        lat=lat,
        lng=lng,
        updated_at="2024-01-01T00:00:00.000Z",
    )


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
        base = body["features"][0]
        props = base["properties"]
        assert props["category"] == "curb_ramps"
        assert props["along_route_meters"] == 140.6
        assert body["meta"]["truncated"] is False
        assert body["meta"]["feature_count_total"] == 1
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
        for key in appendix_keys:
            assert key in props


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


def _one_pg_feature(
    along_route_meters: float,
) -> Any:  # noqa: ANN401 - test fixture builder
    async def _stub(
        session: Any,
        **_kwargs: Any,  # noqa: ARG001
    ) -> tuple[list[dict[str, Any]], float, bool, int]:
        feats = [
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-77.05, 38.95]},
                "properties": {
                    "id": "fixture:pg",
                    "category": "curb_ramps",
                    "kind": "obstacle",
                    "condition": "Good",
                    "condition_normalized": "good",
                    "inspected_year": 2020,
                    "source_dataset": "fixture",
                    "source_id": "1",
                    "attributes": {},
                    "along_route_meters": along_route_meters,
                },
            }
        ]
        return feats, 9.0, False, 1

    return _stub


def test_route_features_merges_and_sorts_restrooms(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        route_features_module, "corridor_features_geojson", _one_pg_feature(140.6)
    )
    # Two restrooms sitting on the route's endpoints (distance 0 from the line):
    # one at the start (along ~0) and one at the end (along ~route length).
    fake = _FakeRestroomsProvider(
        [_restroom_at("start", -77.1, 38.9), _restroom_at("end", -77.0, 39.0)]
    )
    app.dependency_overrides[restrooms_dependency] = lambda: fake
    try:
        with TestClient(app) as client:
            body = client.post(
                "/api/route-features",
                json={
                    "route_geometry": _VALID_LINE,
                    "buffer_meters": 30,
                    "categories": ["curb_ramps", "restrooms"],
                },
            ).json()
    finally:
        app.dependency_overrides.pop(restrooms_dependency, None)

    ids = [f["properties"]["id"] for f in body["features"]]
    assert ids == ["refugerestrooms:start", "fixture:pg", "refugerestrooms:end"]


def test_route_features_restroom_count_added_to_total(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        route_features_module, "corridor_features_geojson", _one_pg_feature(140.6)
    )
    fake = _FakeRestroomsProvider([_restroom_at("start", -77.1, 38.9)])
    app.dependency_overrides[restrooms_dependency] = lambda: fake
    try:
        with TestClient(app) as client:
            body = client.post(
                "/api/route-features",
                json={
                    "route_geometry": _VALID_LINE,
                    "buffer_meters": 30,
                    "categories": ["curb_ramps", "restrooms"],
                },
            ).json()
    finally:
        app.dependency_overrides.pop(restrooms_dependency, None)

    assert body["meta"]["feature_count_total"] == 2


def test_route_features_skips_restrooms_when_not_enabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        route_features_module, "corridor_features_geojson", _one_pg_feature(140.6)
    )
    fake = _FakeRestroomsProvider([_restroom_at("start", -77.1, 38.9)])
    app.dependency_overrides[restrooms_dependency] = lambda: fake
    try:
        with TestClient(app) as client:
            body = client.post(
                "/api/route-features",
                json={
                    "route_geometry": _VALID_LINE,
                    "buffer_meters": 30,
                    "categories": ["curb_ramps"],
                },
            ).json()
    finally:
        app.dependency_overrides.pop(restrooms_dependency, None)

    ids = [f["properties"]["id"] for f in body["features"]]
    assert ids == ["fixture:pg"] and fake.called is False


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
