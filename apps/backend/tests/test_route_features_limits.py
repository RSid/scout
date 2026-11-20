"""Input limits on `POST /api/route-features` (M1-F07): shape, vertex cap,
service area, and the corridor statement timeout."""

from __future__ import annotations

import json
from collections.abc import Iterator
from typing import Any

import pytest
from starlette.testclient import TestClient

from scout.api import route_features as route_features_module
from scout.api.route_features import MAX_ROUTE_GEOMETRY_POINTS
from scout.errors import CorridorQueryTimeoutError
from scout.main import app
from scout.security.body_limit import MAX_REQUEST_BODY_BYTES
from scout.security.rate_limit import limiter

_IN_DC = [[-77.05, 38.90], [-77.00, 38.95]]


@pytest.fixture(autouse=True)
def _isolate_rate_buckets() -> Iterator[None]:
    """Many requests per module; keep the 30/min bucket from leaking across tests."""

    limiter.reset()
    yield
    limiter.reset()


@pytest.fixture
def stub_corridor(monkeypatch: pytest.MonkeyPatch) -> None:
    # MOCK: replace the PostGIS corridor query with an empty result so these
    # tests exercise request validation offline (no database in unit CI).
    async def _empty(
        session: Any, **kwargs: Any
    ) -> tuple[list[dict[str, Any]], float, bool, int]:
        del session, kwargs
        return [], 0.0, False, 0

    monkeypatch.setattr(route_features_module, "corridor_features_geojson", _empty)


def _payload(coordinates: Any) -> dict[str, Any]:
    return {
        "route_geometry": {"type": "LineString", "coordinates": coordinates},
        "buffer_meters": 30,
        "categories": ["curb_ramps"],
    }


def _post(payload: dict[str, Any]) -> Any:
    with TestClient(app) as client:
        return client.post("/api/route-features", json=payload)


def _error(resp: Any) -> tuple[int, str]:
    return resp.status_code, resp.json()["error"]["code"]


def _zigzag(count: int) -> list[list[float]]:
    """`count` full-precision points alternating across downtown DC."""

    return [
        [-77.0412345678901 + (i % 2) * 0.01, 38.8912345678901 + i * 0.00001]
        for i in range(count)
    ]


@pytest.mark.parametrize(
    "coordinates",
    [
        [["a", "b"], ["c", "d"]],
        [["-77.05", "38.90"], ["-77.00", "38.95"]],
        [[-77.05, None], [-77.00, 38.95]],
        [[True, 38.90], [-77.00, 38.95]],
        [[[-77.05, 38.90]], [-77.00, 38.95]],
        "not-a-list",
        [-77.05, 38.90],
    ],
    ids=["letters", "numeric-strings", "null", "bool", "nested", "string", "flat"],
)
def test_non_numeric_coordinates_are_invalid_input(coordinates: Any) -> None:
    assert _error(_post(_payload(coordinates))) == (400, "INVALID_INPUT")


@pytest.mark.parametrize("token", ["NaN", "Infinity", "-Infinity"])
def test_non_finite_coordinates_are_invalid_input(token: str) -> None:
    # Python's JSON parser accepts these non-standard tokens, so send raw text.
    body = json.dumps(_payload(_IN_DC)).replace("-77.05", token, 1)
    with TestClient(app) as client:
        resp = client.post(
            "/api/route-features",
            content=body,
            headers={"Content-Type": "application/json"},
        )
    assert _error(resp) == (400, "INVALID_INPUT")


@pytest.mark.parametrize(
    "coordinates",
    [[], [[-77.05, 38.90]]],
    ids=["empty", "single-point"],
)
def test_fewer_than_two_points_is_invalid_input(coordinates: Any) -> None:
    assert _error(_post(_payload(coordinates))) == (400, "INVALID_INPUT")


@pytest.mark.parametrize(
    "coordinates",
    [[[-77.05], [-77.00, 38.95]], [[-77.05, 38.90, 12.0], [-77.00, 38.95]]],
    ids=["one-element", "three-element"],
)
def test_positions_must_be_lon_lat_pairs(coordinates: Any) -> None:
    assert _error(_post(_payload(coordinates))) == (400, "INVALID_INPUT")


def test_geometry_type_must_be_linestring() -> None:
    payload = _payload(_IN_DC)
    payload["route_geometry"]["type"] = "MultiPoint"
    assert _error(_post(payload)) == (400, "INVALID_INPUT")


def test_too_many_points_is_route_geometry_too_large() -> None:
    payload = _payload(_zigzag(MAX_ROUTE_GEOMETRY_POINTS + 1))
    assert _error(_post(payload)) == (400, "ROUTE_GEOMETRY_TOO_LARGE")


@pytest.mark.usefixtures("stub_corridor")
def test_max_size_request_fits_body_cap_and_succeeds() -> None:
    payload = _payload(_zigzag(MAX_ROUTE_GEOMETRY_POINTS))
    payload["categories"] = ["curb_ramps", "restrooms", "audible_signals"]
    assert len(json.dumps(payload).encode()) < MAX_REQUEST_BODY_BYTES
    assert _post(payload).status_code == 200


@pytest.mark.parametrize(
    "coordinates",
    [
        [[-74.006, 40.7128], [-73.99, 40.73]],
        [[-77.05, 38.90], [-74.006, 40.7128]],
        [[-77.05, 38.90], [-77.00, 39.02]],
        [[-77.05, 38.90], [-77.14, 38.95]],
    ],
    ids=["nyc", "one-endpoint-in-nyc", "north-past-margin", "west-past-margin"],
)
def test_coordinates_outside_dc_are_rejected(coordinates: Any) -> None:
    assert _error(_post(_payload(coordinates))) == (400, "OUTSIDE_SERVICE_AREA")


@pytest.mark.usefixtures("stub_corridor")
def test_route_grazing_the_dc_edge_is_accepted() -> None:
    # 0.005 deg past the east edge (-76.91): inside the snapping margin.
    payload = _payload([[-76.95, 38.90], [-76.905, 38.89], [-76.95, 38.88]])
    assert _post(payload).status_code == 200


def test_corridor_timeout_is_a_clean_503(monkeypatch: pytest.MonkeyPatch) -> None:
    # MOCK: simulate the store raising on Postgres statement_timeout; the
    # real SQLSTATE translation is covered in test_store_corridor_timeout.py.
    async def _timeout(session: Any, **kwargs: Any) -> Any:
        del session, kwargs
        raise CorridorQueryTimeoutError()

    monkeypatch.setattr(route_features_module, "corridor_features_geojson", _timeout)
    assert _error(_post(_payload(_IN_DC))) == (503, "CORRIDOR_QUERY_TIMEOUT")
