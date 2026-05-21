"""Contract tests for `GET /api/categories`."""

from __future__ import annotations

from starlette.testclient import TestClient

from scout.data.schema import CategoriesResponse
from scout.main import app


def test_categories_contract() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/categories")
        assert resp.status_code == 200
        body = CategoriesResponse.model_validate(resp.json())
        ids = [cat.id for cat in body.categories]
        assert ids[0] == "curb_ramps"
