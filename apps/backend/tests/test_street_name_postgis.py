"""Gated PostGIS integration check for street-name enrichment (DEC-027).

Exercises the *real* KNN `UPDATE` against a live PostGIS database. Opt-in: set
``SCOUT_RUN_PG_TESTS=1`` with ``SCOUT_DATABASE_URL`` pointing at a
Postgres+PostGIS instance (the CI ``postgis`` service works). Skipped by default
so the offline-first unit suite stays deterministic. The DB-free shape of the
same statements is covered by ``test_store_street_name_query.py``.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Awaitable

import pytest
from geoalchemy2 import WKTElement
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from scout.data.models import DcStreetSegment, Feature
from scout.data.store import feature_street_name_update

pytestmark = pytest.mark.skipif(
    not os.getenv("SCOUT_RUN_PG_TESTS"),
    reason="Set SCOUT_RUN_PG_TESTS=1 and a seeded PostGIS DB to run.",
)


def _run[T](coro: Awaitable[T]) -> T:
    return asyncio.run(coro)  # type: ignore[arg-type]


def _feature(fid: str, lon: float, lat: float) -> Feature:
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
        geom=WKTElement(f"POINT({lon} {lat})", srid=4326),
    )


def _segment(sid: str, name: str, wkt: str) -> DcStreetSegment:
    return DcStreetSegment(
        id=sid, name=name, source_id=sid, geom=WKTElement(wkt, srid=4326)
    )


async def _seed_and_enrich() -> str | None:
    url = os.environ["SCOUT_DATABASE_URL"]
    engine = create_async_engine(url)
    try:
        async with engine.begin() as conn:
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS postgis"))
            await conn.run_sync(Feature.__table__.create, checkfirst=True)
            await conn.run_sync(DcStreetSegment.__table__.create, checkfirst=True)
            await conn.execute(text("DELETE FROM features"))
            await conn.execute(text("DELETE FROM dc_street_segments"))
        sessionmaker = async_sessionmaker(engine, expire_on_commit=False)
        async with sessionmaker() as session:
            # A feature right next to the "14th St NW" line and far from "M St".
            session.add(_feature("f1", -77.0320, 38.9070))
            session.add(
                _segment(
                    "near",
                    "14th St NW",
                    "LINESTRING(-77.0321 38.9069, -77.0321 38.9072)",
                )
            )
            session.add(
                _segment(
                    "far", "M St NW", "LINESTRING(-77.0500 38.9000, -77.0490 38.9000)"
                )
            )
            await session.commit()
            await session.execute(feature_street_name_update())
            await session.commit()
            return (
                await session.execute(
                    select(Feature.street_name).where(Feature.id == "f1")
                )
            ).scalar_one()
    finally:
        await engine.dispose()


def test_enrichment_stamps_the_nearest_segment_name() -> None:
    assert _seed_and_enrich() == "14th St NW"
