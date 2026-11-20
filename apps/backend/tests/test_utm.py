"""POST /api/utm contract tests (M1-F12).

Mocks introduced
----------------
- ``_FakeSession`` replaces the SQLAlchemy ``AsyncSession`` via a FastAPI
  dependency override: no Postgres is available in unit runs, and these
  tests target the HTTP contract, not the SQL upsert.
"""

from __future__ import annotations

from collections.abc import Iterator
from typing import Any

import pytest
from starlette.testclient import TestClient

from scout.data.session import get_session
from scout.main import app
from scout.security.rate_limit import limiter


class _FakeSession:
    """Records executes/commits instead of talking to Postgres."""

    def __init__(self) -> None:
        self.executed: list[dict[str, Any]] = []
        self.commits = 0

    async def execute(self, _statement: Any, params: dict[str, Any]) -> None:
        self.executed.append(params)

    async def commit(self) -> None:
        self.commits += 1


@pytest.fixture(autouse=True)
def _isolate_rate_buckets() -> Iterator[None]:
    limiter.reset()
    limiter.enabled = True
    yield
    limiter.reset()
    limiter.enabled = True


@pytest.fixture
def fake_session() -> Iterator[_FakeSession]:
    session = _FakeSession()
    # MOCK: in-memory session stand-in; no Postgres in unit tests.
    app.dependency_overrides[get_session] = lambda: session
    yield session
    app.dependency_overrides.pop(get_session, None)


def test_utm_post_returns_bodiless_204(fake_session: _FakeSession) -> None:
    with TestClient(app) as client:
        resp = client.post("/api/utm", json={"source": "reddit"})
    assert (resp.status_code, resp.content) == (204, b"")


def test_utm_post_stores_and_commits_visit(fake_session: _FakeSession) -> None:
    with TestClient(app) as client:
        client.post(
            "/api/utm",
            json={"source": "reddit", "medium": "social", "campaign": "launch"},
        )
    row = fake_session.executed[0]
    assert (row["source"], row["medium"], row["campaign"], fake_session.commits) == (
        "reddit",
        "social",
        "launch",
        1,
    )


def test_utm_post_defaults_medium_and_campaign_to_empty(
    fake_session: _FakeSession,
) -> None:
    with TestClient(app) as client:
        client.post("/api/utm", json={"source": "reddit"})
    row = fake_session.executed[0]
    assert (row["medium"], row["campaign"]) == ("", "")


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"source": ""},
        {"source": "x" * 201},
        {"source": "reddit", "medium": "x" * 201},
        {"source": "reddit", "extra": "nope"},
        {"source": 123},
    ],
)
def test_utm_post_rejects_invalid_payload_with_400(
    fake_session: _FakeSession, payload: dict[str, Any]
) -> None:
    with TestClient(app) as client:
        resp = client.post("/api/utm", json=payload)
    assert (resp.status_code, resp.json()["error"]["code"], fake_session.commits) == (
        400,
        "INVALID_INPUT",
        0,
    )


def test_utm_post_is_rate_limited_to_ten_per_minute(fake_session: _FakeSession) -> None:
    with TestClient(app) as client:
        for _ in range(10):
            assert client.post("/api/utm", json={"source": "reddit"}).status_code == 204
        resp = client.post("/api/utm", json={"source": "reddit"})
    assert (resp.status_code, resp.json()["error"]["code"]) == (429, "RATE_LIMIT")
