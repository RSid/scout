"""Transactional + update-path coverage for the DC ingest pipeline.

These complement `test_ingest_dc_idempotency.py` (insert → unchanged on second
pass). M1-F11 acceptance also calls for:

- A mutated input row produces *exactly one* update (proving the
  `IS DISTINCT FROM` predicate in `pipeline._bulk_upsert_chunk` correctly
  distinguishes "updated" from "unchanged").
- A mid-run failure leaves the `features` table untouched (DEC-019: "the
  entire ingest runs in one transaction; on any error, rollback").

The helpers mirror those in `test_ingest_dc_idempotency.py`; intentionally not
DRYed across files to keep this PR scope-narrow. If a third user appears,
extract them into `tests/_ingest_db_utils.py`.
"""

from __future__ import annotations

import dataclasses
import json
import os
import subprocess
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

pytest.importorskip("testcontainers")
from testcontainers.postgres import PostgresContainer  # noqa: E402

from scout.ingest import pipeline  # noqa: E402
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
    env["SCOUT_DB_HOST_PORT"] = ""
    subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=str(backend_root),
        env=env,
        check=True,
        capture_output=True,
        text=True,
    )


def _curb_ramp_spec() -> DatasetSpec:
    return DatasetSpec(
        id="ADA_Curb_Ramp.geojson",
        filename="ADA_Curb_Ramp.geojson",
        category="curb_ramps",
        source_dataset="dc_ada_curb_ramp",
        mapper=normalize_curb_ramp,
    )


def _seed_curb_ramp_geojson(data_dir: Path, *, count: int) -> None:
    features: list[dict[str, object]] = []
    for idx in range(count):
        features.append(
            {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [-77.035 + idx * 1e-4, 38.905],
                },
                "properties": {
                    "GIS_ID": f"ADA_TXN_PT_{idx}",
                    "CONDITION": "Good",
                    "STATUS": None,
                    "YEAR_INSPECTED": 2024,
                    "ESTIMATED_YEAR_OF_IMPROVEMENT": None,
                    "INTERSECTION_ID": None,
                },
            }
        )
    (data_dir / "ADA_Curb_Ramp.geojson").write_text(
        json.dumps({"type": "FeatureCollection", "features": features}),
        encoding="utf-8",
    )


@pytest.mark.integration
def test_single_mutated_row_yields_exactly_one_update(tmp_path: Path) -> None:
    """Changing one row's CONDITION between runs must report (0, 1, N-1)."""

    _require_docker()
    spec = _curb_ramp_spec()
    _seed_curb_ramp_geojson(tmp_path, count=3)

    with PostgresContainer("postgis/postgis:16-3.4-alpine") as postgres:
        sync_url = postgres.get_connection_url(driver="psycopg")
        _alembic_upgrade(_async_scout_database_url(sync_url))

        rows, _ = load_dc_normalized_rows(tmp_path, datasets=(spec,))
        engine = create_engine(sync_url)
        upsert_normalized_rows(engine, rows)

        mutated = list(rows)
        mutated[0] = dataclasses.replace(
            rows[0], condition="Fair", condition_normalized="mild"
        )

        inserts, updates, unchanged = upsert_normalized_rows(engine, mutated)

    assert (inserts, updates, unchanged) == (0, 1, 2)


@pytest.mark.integration
def test_mid_run_failure_rolls_back_whole_ingest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A raise after a partial write must leave `features` empty (DEC-019)."""

    _require_docker()
    spec = _curb_ramp_spec()
    _seed_curb_ramp_geojson(tmp_path, count=3)

    with PostgresContainer("postgis/postgis:16-3.4-alpine") as postgres:
        sync_url = postgres.get_connection_url(driver="psycopg")
        _alembic_upgrade(_async_scout_database_url(sync_url))

        rows, _ = load_dc_normalized_rows(tmp_path, datasets=(spec,))
        engine = create_engine(sync_url)

        original_chunk = pipeline._bulk_upsert_chunk

        def _raise_after_first_chunk(
            *args: object, **kwargs: object
        ) -> tuple[int, int, int]:
            # MOCK: forces a failure inside engine.begin() AFTER the chunk has
            # already executed; proves the surrounding transaction rolls back
            # even when rows have been written within it.
            original_chunk(*args, **kwargs)  # type: ignore[arg-type]
            raise RuntimeError("simulated mid-ingest failure for rollback test")

        monkeypatch.setattr(pipeline, "_bulk_upsert_chunk", _raise_after_first_chunk)

        with pytest.raises(RuntimeError, match="simulated"):
            upsert_normalized_rows(engine, rows)

        with engine.connect() as conn:
            total = conn.execute(text("SELECT count(*) FROM features")).scalar_one()

    assert total == 0
