"""Contract tests for `GET /api/health`."""

from __future__ import annotations

from starlette.testclient import TestClient

from scout.data.schema import HealthResponse
from scout.main import app


def test_health_contract() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/health")
        assert resp.status_code == 200
        parsed = HealthResponse.model_validate_json(resp.content)
        assert parsed.db == "up"
        assert parsed.features == 137
