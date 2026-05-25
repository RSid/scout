"""Postgres ingest idempotency against an ephemeral PostGIS container."""

from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

pytest.importorskip("testcontainers")
from testcontainers.postgres import PostgresContainer  # noqa: E402

from scout.ingest.dc import DatasetSpec, normalize_curb_ramp  # noqa: E402

os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")

from scout.ingest.pipeline import (  # noqa: E402
    load_dc_normalized_rows,
    upsert_normalized_rows,
)


def _require_docker() -> None:
    try:
        import docker

        docker.from_env().ping()
    except Exception as exc:
        pytest.skip(f"Docker not available ({exc})")


def _async_scout_database_url(sync_psycopg_url: str) -> str:
    assert "+psycopg://" in sync_psycopg_url
    return sync_psycopg_url.replace("+psycopg://", "+asyncpg://", 1)


def _alembic_upgrade(async_url: str) -> None:
    backend_root = Path(__file__).resolve().parents[1]
    env = dict(os.environ)
    env["SCOUT_DATABASE_URL"] = async_url
    # Defeat host-port override leaking in from the developer's repo .env;
    # the testcontainer publishes on an ephemeral port already inside async_url.
    env["SCOUT_DB_HOST_PORT"] = ""
    subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=str(backend_root),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def _minimal_curb_ramp_geojson(features: list[dict[str, object]]) -> str:
    return json.dumps({"type": "FeatureCollection", "features": features})


@pytest.mark.integration
def test_dc_upsert_is_idempotent_on_second_pass(tmp_path: Path) -> None:
    """Second identical ingest must report zero inserts, zero updates, all skipped."""

    _require_docker()

    spec = DatasetSpec(
        id="ADA_Curb_Ramp.geojson",
        filename="ADA_Curb_Ramp.geojson",
        category="curb_ramps",
        source_dataset="dc_ada_curb_ramp",
        mapper=normalize_curb_ramp,
    )

    payloads: list[dict[str, object]] = []
    base_props = {"CONDITION": "Good", "STATUS": None, "YEAR_INSPECTED": 2024}
    for idx in range(3):
        payloads.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [-77.035 + idx * 1e-4, 38.905],
                },
                "properties": {
                    **base_props,
                    "GIS_ID": f"ADA_INGEST_PT_{idx}",
                    "ESTIMATED_YEAR_OF_IMPROVEMENT": None,
                    "INTERSECTION_ID": None,
                },
            }
        )
    (tmp_path / spec.filename).write_text(
        _minimal_curb_ramp_geojson(payloads), encoding="utf-8"
    )

    with PostgresContainer("postgis/postgis:16-3.4-alpine") as postgres:
        sync_url = postgres.get_connection_url(driver="psycopg")
        async_url = _async_scout_database_url(sync_url)
        _alembic_upgrade(async_url)

        rows, malformed = load_dc_normalized_rows(tmp_path, datasets=(spec,))
        assert malformed == 0 and len(rows) == 3

        engine = create_engine(sync_url)
        inserts1, updates1, skips1 = upsert_normalized_rows(engine, rows)

        inserts2, updates2, skips2 = upsert_normalized_rows(engine, rows)

        with engine.connect() as conn:
            total = conn.execute(text("SELECT count(*) FROM features")).scalar()

        assert inserts1 == 3 and updates1 == 0 and skips1 == 0
        assert inserts2 == 0 and updates2 == 0 and skips2 == 3
        assert total == 3
