"""Request body byte cap (`RequestBodyLimitMiddleware`, M1-F07 / M1-F12)."""

from __future__ import annotations

import json
from collections.abc import Iterator

import pytest
from starlette.testclient import TestClient

from scout.main import app
from scout.security.body_limit import MAX_REQUEST_BODY_BYTES
from scout.security.rate_limit import limiter

_JSON = {"Content-Type": "application/json"}
_SMALL_INVALID_BODY = json.dumps({"route_geometry": {}, "categories": []}).encode()


@pytest.fixture(autouse=True)
def _isolate_rate_buckets() -> Iterator[None]:
    limiter.reset()
    yield
    limiter.reset()


def _chunks(total: int, size: int = 64 * 1024) -> Iterator[bytes]:
    """A body with no Content-Length (TestClient sends it chunked)."""

    sent = 0
    while sent < total:
        step = min(size, total - sent)
        sent += step
        yield b" " * step


def test_declared_oversize_body_is_413() -> None:
    body = b" " * (MAX_REQUEST_BODY_BYTES + 1)
    with TestClient(app) as client:
        resp = client.post("/api/route-features", content=body, headers=_JSON)
    assert (resp.status_code, resp.json()["error"]["code"]) == (
        413,
        "REQUEST_TOO_LARGE",
    )


def test_chunked_oversize_body_is_413() -> None:
    with TestClient(app) as client:
        resp = client.post(
            "/api/route-features",
            content=_chunks(MAX_REQUEST_BODY_BYTES + 1),
            headers=_JSON,
        )
    assert (resp.status_code, resp.json()["error"]["code"]) == (
        413,
        "REQUEST_TOO_LARGE",
    )


def test_chunked_body_under_cap_reaches_the_handler() -> None:
    # The handler's own validation answering 400 proves the body was replayed.
    with TestClient(app) as client:
        resp = client.post(
            "/api/route-features",
            content=iter([_SMALL_INVALID_BODY]),
            headers=_JSON,
        )
    assert resp.json()["error"]["code"] == "INVALID_INPUT"


def test_get_requests_are_not_limited() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/categories")
    assert resp.status_code == 200
