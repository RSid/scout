"""Gated PostGIS integration checks for the corridor query (M1-F07 S2/S3).

These exercise the *real* spatial SQL against a live PostGIS database and are
therefore opt-in: set ``SCOUT_RUN_PG_TESTS=1`` with ``SCOUT_DATABASE_URL``
pointing at a Postgres+PostGIS instance (the CI ``postgis`` service works). They
are skipped by default so the offline-first unit suite stays deterministic.

They bypass the app's request-scoped session (which is synthetic under
``SCOUT_UNDER_TEST``) and talk to their own engine so we can seed known rows.

Note: not exercised in the default CI run. The DB-free shape of the same query
is covered by ``test_store_corridor_query.py``.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable

import pytest
from geoalchemy2 import WKTElement
from sqlalchemy import text
from sqlalchemy.dialects import postgresql
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scout.data.models import Feature
from scout.data.store import corridor_features_geojson, corridor_features_select

pytestmark = pytest.mark.skipif(
    not os.getenv("SCOUT_RUN_PG_TESTS"),
    reason="Set SCOUT_RUN_PG_TESTS=1 and a seeded PostGIS DB to run.",
)

_LINE = [[-77.05, 38.90], [-77.00, 38.95]]


def _run[T](coro: Awaitable[T]) -> T:
    return asyncio.run(coro)  # type: ignore[arg-type]  # Awaitable→Coroutine at call site


def _point_along(fraction: float) -> WKTElement:
    lon = -77.05 + fraction * 0.05
    lat = 38.90 + fraction * 0.05
    return WKTElement(f"POINT({lon} {lat})", srid=4326)


def _feature(fid: str, fraction: float) -> Feature:
    return Feature(
        id=fid,
        category="curb_ramps",
        kind="obstacle",
        condition="Good",
        condition_normalized="good",
        inspected_year=2021,
        source_dataset="fixture",
        source_id=fid,
        attributes={},
        geom=_point_along(fraction),
    )


async def _seed_and_query() -> list[str]:
    url = os.environ["SCOUT_DATABASE_URL"]
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            await conn.run_sync(Feature.__table__.create, checkfirst=True)
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS features_geom_idx "
                    "ON features USING gist (geom)"
                )
            )
            await conn.execute(text("DELETE FROM features"))
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        async with sessionmaker() as session:
            # Insert out of along-route order, with ids that sort the OPPOSITE
            # way, so a pass proves ordering is by along-route fraction (not id,
            # not insertion order).
            session.add_all(
                [
                    _feature("aaa", 0.8),
                    _feature("zzz", 0.2),
                    _feature("mmm", 0.5),
                ]
            )
            await session.commit()
            feats, _ms, _trunc, total = await corridor_features_geojson(
                session,
                coordinates=_LINE,
                categories=["curb_ramps"],
                buffer_meters=100.0,
            )
        assert total == 3
        return [f["properties"]["id"] for f in feats]
    finally:
        await engine.dispose()


def test_corridor_orders_by_along_route_distance_not_id() -> None:
    ids = _run(_seed_and_query())
    assert ids == ["zzz", "mmm", "aaa"]


async def _explain_plan() -> str:
    url = os.environ["SCOUT_DATABASE_URL"]
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            await conn.run_sync(Feature.__table__.create, checkfirst=True)
            await conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS features_geom_idx "
                    "ON features USING gist (geom)"
                )
            )
            # Tiny tables always seq-scan; force the planner to prove the GIST
            # index is usable for the corridor predicate.
            await conn.execute(text("SET LOCAL enable_seqscan = off"))
            stmt = corridor_features_select(_LINE, ["curb_ramps"], 30.0)
            sql = str(
                stmt.compile(
                    dialect=postgresql.dialect(),
                    compile_kwargs={"literal_binds": True},
                )
            )
            result = await conn.execute(text(f"EXPLAIN {sql}"))
            return "\n".join(str(r[0]) for r in result)
    finally:
        await engine.dispose()


def test_corridor_query_can_use_the_gist_index() -> None:
    plan = _run(_explain_plan())
    assert "features_geom_idx" in plan
