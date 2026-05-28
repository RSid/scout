"""DB-touching tests for the M1-T03 ingestion pipeline.

These spin up an ephemeral PostGIS container (testcontainers) once per
session, apply `alembic upgrade head` against it, and exercise the
idempotency / update / rollback contracts the script promises.

If Docker isn't reachable the entire module is skipped so a contributor's
`make test` still passes locally without Docker. CI always has Docker, so
these tests gate every merge through the standard `backend` job.
"""

from __future__ import annotations

import json
import os
from collections.abc import Generator
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy.engine import Engine, create_engine

testcontainers_postgres = pytest.importorskip("testcontainers.postgres")
PostgresContainer = testcontainers_postgres.PostgresContainer

import ingest_dc  # noqa: E402
from _dc_mappers import IngestSource, normalize_curb_ramp  # noqa: E402

from scout.config import migrate_sync_database_url  # noqa: E402

REPO_ROOT = Path(__file__).resolve().parents[3]


def _docker_available() -> bool:
    try:
        import docker

        docker.from_env().ping()
    except Exception:
        return False
    return True


pytestmark = pytest.mark.skipif(
    not _docker_available(),
    reason="Docker daemon not reachable; testcontainers cannot start PostGIS",
)


def _to_async_dsn(sync_dsn: str) -> str:
    if "+psycopg2" in sync_dsn:
        return sync_dsn.replace("+psycopg2", "+asyncpg", 1)
    if "+psycopg" in sync_dsn:
        return sync_dsn.replace("+psycopg", "+asyncpg", 1)
    return sync_dsn.replace("postgresql://", "postgresql+asyncpg://", 1)


@pytest.fixture(scope="session")
def pg_engine() -> Generator[Engine, None, None]:
    """Ephemeral PostGIS, schema applied via the real Alembic migration."""

    # The Ryuk reaper container needs a port mapping that Docker Desktop on
    # macOS sometimes refuses; the `with` block already guarantees cleanup.
    os.environ.setdefault("TESTCONTAINERS_RYUK_DISABLED", "true")
    with PostgresContainer("postgis/postgis:16-3.4") as pg:
        async_dsn = _to_async_dsn(pg.get_connection_url())
        sync_dsn = migrate_sync_database_url(async_dsn)
        prior_url = os.environ.get("SCOUT_DATABASE_URL")
        os.environ["SCOUT_DATABASE_URL"] = async_dsn
        try:
            from alembic.config import Config

            from alembic import command

            cfg = Config(str(REPO_ROOT / "apps" / "backend" / "alembic.ini"))
            command.upgrade(cfg, "head")
            engine = create_engine(sync_dsn)
            try:
                yield engine
            finally:
                engine.dispose()
        finally:
            if prior_url is None:
                os.environ.pop("SCOUT_DATABASE_URL", None)
            else:
                os.environ["SCOUT_DATABASE_URL"] = prior_url


@pytest.fixture
def clean_features(pg_engine: Engine) -> Generator[Engine, None, None]:
    with pg_engine.begin() as conn:
        conn.execute(sa.text("TRUNCATE TABLE features"))
    yield pg_engine


def _write_curb_ramp_geojson(
    target: Path,
    rows: list[dict[str, object]],
) -> None:
    features = [
        {
            "type": "Feature",
            "properties": row["properties"],
            "geometry": {
                "type": "Point",
                "coordinates": [row["lon"], row["lat"]],
            },
        }
        for row in rows
    ]
    target.write_text(
        json.dumps({"type": "FeatureCollection", "features": features}),
        encoding="utf-8",
    )


def _curb_ramp_source(geojson_path: Path) -> IngestSource:
    return IngestSource(
        path=str(geojson_path.relative_to(REPO_ROOT))
        if geojson_path.is_relative_to(REPO_ROOT)
        else str(geojson_path),
        source_dataset="dc_ada_curb_ramp",
        category="curb_ramps",
        normalize=normalize_curb_ramp,
    )


def _features_count(engine: Engine) -> int:
    with engine.connect() as conn:
        return int(conn.execute(sa.text("SELECT count(*) FROM features")).scalar_one())


def _engine_dsn(engine: Engine) -> str:
    return engine.url.render_as_string(hide_password=False)


@pytest.fixture
def fixture_source(tmp_path: Path) -> IngestSource:
    geojson = tmp_path / "curb_ramps.geojson"
    _write_curb_ramp_geojson(
        geojson,
        [
            {
                "properties": {
                    "GIS_ID": "FIXT-1",
                    "CONDITION": "Good",
                    "YEAR_INSPECTED": 2020,
                },
                "lon": -77.03,
                "lat": 38.9,
            },
            {
                "properties": {
                    "GIS_ID": "FIXT-2",
                    "CONDITION": "Non-Compliant",
                    "YEAR_INSPECTED": 2021,
                },
                "lon": -77.04,
                "lat": 38.91,
            },
        ],
    )
    return IngestSource(
        path=str(geojson),
        source_dataset="dc_ada_curb_ramp",
        category="curb_ramps",
        normalize=normalize_curb_ramp,
    )


def _patch_path_resolution(
    monkeypatch: pytest.MonkeyPatch, source: IngestSource
) -> None:
    """Short-circuit `_resolve_path` so the temp fixture is loaded directly."""

    abs_path = Path(source.path)
    monkeypatch.setattr(ingest_dc, "_resolve_path", lambda rel: abs_path)


def test_first_run_inserts_every_row(
    clean_features: Engine,
    fixture_source: IngestSource,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_path_resolution(monkeypatch, fixture_source)

    summary = ingest_dc.run_ingest(
        database_url=_engine_dsn(clean_features),
        dry_run=False,
        include_osm=False,
        sources=(fixture_source,),
        skipped=(),
    )

    assert (summary.inserted, summary.updated, summary.unchanged) == (2, 0, 0)


def test_second_run_with_unchanged_input_yields_all_unchanged(
    clean_features: Engine,
    fixture_source: IngestSource,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_path_resolution(monkeypatch, fixture_source)
    ingest_dc.run_ingest(
        database_url=_engine_dsn(clean_features),
        dry_run=False,
        include_osm=False,
        sources=(fixture_source,),
        skipped=(),
    )

    second = ingest_dc.run_ingest(
        database_url=_engine_dsn(clean_features),
        dry_run=False,
        include_osm=False,
        sources=(fixture_source,),
        skipped=(),
    )

    assert (second.inserted, second.updated, second.unchanged) == (0, 0, 2)


def test_mutated_input_yields_one_update(
    clean_features: Engine,
    fixture_source: IngestSource,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    _patch_path_resolution(monkeypatch, fixture_source)
    ingest_dc.run_ingest(
        database_url=_engine_dsn(clean_features),
        dry_run=False,
        include_osm=False,
        sources=(fixture_source,),
        skipped=(),
    )
    _write_curb_ramp_geojson(
        Path(fixture_source.path),
        [
            {
                "properties": {
                    "GIS_ID": "FIXT-1",
                    "CONDITION": "Fair",
                    "YEAR_INSPECTED": 2020,
                },
                "lon": -77.03,
                "lat": 38.9,
            },
            {
                "properties": {
                    "GIS_ID": "FIXT-2",
                    "CONDITION": "Non-Compliant",
                    "YEAR_INSPECTED": 2021,
                },
                "lon": -77.04,
                "lat": 38.91,
            },
        ],
    )

    summary = ingest_dc.run_ingest(
        database_url=_engine_dsn(clean_features),
        dry_run=False,
        include_osm=False,
        sources=(fixture_source,),
        skipped=(),
    )

    assert (summary.inserted, summary.updated, summary.unchanged) == (0, 1, 1)


def test_rollback_leaves_table_untouched_on_mid_run_failure(
    clean_features: Engine,
    fixture_source: IngestSource,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _patch_path_resolution(monkeypatch, fixture_source)
    starting_count = _features_count(clean_features)

    def _boom(*args: object, **kwargs: object) -> None:
        # MOCK: forces a write failure inside the begin()/commit() block so we
        # can prove the whole-run transaction rolls back per DEC-019.
        raise RuntimeError("simulated mid-ingest failure")

    monkeypatch.setattr(ingest_dc, "_upsert_chunk", _boom)

    with pytest.raises(RuntimeError, match="simulated"):
        ingest_dc.run_ingest(
            database_url=_engine_dsn(clean_features),
            dry_run=False,
            include_osm=False,
            sources=(fixture_source,),
            skipped=(),
        )

    assert _features_count(clean_features) == starting_count


def test_osm_path_reads_from_cache_without_network(
    clean_features: Engine,
    fixture_source: IngestSource,
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    # MOCK: pre-populated Overpass cache file so the ingest never touches the
    # network. Mirrors what the real --include-osm path does after the first
    # successful fetch (see scripts/_osm_overpass.py).
    cache_dir = tmp_path / "overpass-cache"
    cache_dir.mkdir()
    (cache_dir / "osm_bench.json").write_text(
        json.dumps(
            {
                "elements": [
                    {
                        "type": "node",
                        "id": 101,
                        "lat": 38.9,
                        "lon": -77.03,
                        "tags": {"amenity": "bench"},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    (cache_dir / "osm_drinking_water.json").write_text(
        json.dumps(
            {
                "elements": [
                    {
                        "type": "node",
                        "id": 202,
                        "lat": 38.91,
                        "lon": -77.04,
                        "tags": {"amenity": "drinking_water"},
                    }
                ]
            }
        ),
        encoding="utf-8",
    )
    _patch_path_resolution(monkeypatch, fixture_source)

    summary = ingest_dc.run_ingest(
        database_url=_engine_dsn(clean_features),
        dry_run=False,
        include_osm=True,
        sources=(fixture_source,),
        skipped=(),
        osm_cache_dir=cache_dir,
    )

    assert summary.per_category["rest_spots"] == 1
