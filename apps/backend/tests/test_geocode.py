"""`/api/geocode/*` contract tests (M1-F03, DEC-022).

Mocks introduced
----------------
- The `stub` geocoding provider (already shipped) is selected via
  `SCOUT_GEOCODING_PROVIDER=stub` in `conftest.py`; no extra wire-level
  mocking is needed for the contract tests below.
"""

from __future__ import annotations

from starlette.testclient import TestClient

from scout.main import app


def test_search_returns_hits_for_known_stub_term() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/geocode/search", params={"q": "Dupont", "limit": 5})

    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["hits"], list)
    assert any(h["label"].lower().startswith("dupont") for h in body["hits"])


def test_search_rejects_short_query() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/geocode/search", params={"q": "ab"})

    assert resp.status_code == 400
    assert resp.json()["error"]["code"] == "INVALID_INPUT"


def test_reverse_returns_a_hit() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/geocode/reverse", params={"lon": -77.04, "lat": 38.9})

    assert resp.status_code == 200
    body = resp.json()
    assert body["hit"]["lon"] == -77.04
    assert body["hit"]["lat"] == 38.9


def test_reverse_rejects_out_of_range_coords() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/geocode/reverse", params={"lon": 200.0, "lat": 0.0})

    assert resp.status_code == 422


def _assert_hit_shape(hit: dict[str, object]) -> None:
    assert isinstance(hit["id"], str)
    assert isinstance(hit["label"], str)
    assert isinstance(hit["lon"], (float, int))
    assert isinstance(hit["lat"], (float, int))
    assert set(hit.keys()) == {"id", "label", "lon", "lat"}


def test_search_response_shape_is_pinned() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/geocode/search", params={"q": "Dupont", "limit": 5})

    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"hits"}
    hits = body["hits"]
    assert isinstance(hits, list)
    assert hits
    for item in hits:
        assert isinstance(item, dict)
        _assert_hit_shape(item)


def test_reverse_response_shape_is_pinned() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/geocode/reverse", params={"lon": -77.04, "lat": 38.9})

    assert resp.status_code == 200
    body = resp.json()
    assert set(body.keys()) == {"hit"}
    hit = body["hit"]
    assert isinstance(hit, dict)
    _assert_hit_shape(hit)
