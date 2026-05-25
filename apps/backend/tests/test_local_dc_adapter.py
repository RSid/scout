"""``LocalDcGeocodingProvider`` exercised against real PostGIS (CI + opt-in local).

Requires ``SCOUT_DATABASE_URL`` pointing at a reachable PostGIS database
(not the default ``localhost:6543/.../disabled`` sentinel from ``conftest.py``).
CI's ``services.postgis`` job satisfies this automatically.
"""

from __future__ import annotations

import os
import subprocess
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from geoalchemy2.elements import WKTElement
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from scout.clients.geocoding.local_dc import LocalDcGeocodingProvider
from scout.data.models import DcAddress
from scout.errors import ScoutError

BACKEND_ROOT = Path(__file__).resolve().parents[1]

# Every test + fixture in this module shares one event loop so the asyncpg
# pool inside `_mar_engine` is reused by the function-scoped session fixture
# and by each test. Mixing loop scopes here surfaces as
# "got Future ... attached to a different loop" /
# "another operation is in progress" — both indicate asyncpg objects being
# touched from the wrong loop.
pytestmark = pytest.mark.asyncio(loop_scope="module")


def _database_url_allowed(url: str) -> bool:
    lowered = url.lower()
    return bool(url) and "/disabled" not in lowered and ":6543/" not in lowered


@pytest.fixture(scope="module")
def _postgis_url() -> str:
    raw = os.environ.get("SCOUT_DATABASE_URL", "")
    if not _database_url_allowed(raw):
        pytest.skip(
            "LocalDcGeocodingProvider integration tests need a reachable "
            "SCOUT_DATABASE_URL (CI services.postgis provides one).",
        )
    subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd=BACKEND_ROOT,
        env={**os.environ, "SCOUT_DATABASE_URL": raw},
        check=True,
    )
    return raw


@pytest_asyncio.fixture(scope="module", loop_scope="module")
async def _mar_engine(_postgis_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(_postgis_url)
    maker = async_sessionmaker(engine, expire_on_commit=False)
    seed_rows = (
        DcAddress(
            id="t_kansas",
            label_full="4818 KANSAS AVENUE NW",
            label_normalized="4818 kansas avenue nw",
            lon=-77.02098615,
            lat=38.94896828,
            geom=WKTElement("POINT(-77.02098615 38.94896828)", srid=4326),
        ),
        DcAddress(
            id="t_decoy",
            label_full="4818 MARKET STREET NW",
            label_normalized="4818 market street nw",
            lon=-77.033,
            lat=38.958,
            geom=WKTElement("POINT(-77.033 38.958)", srid=4326),
        ),
        DcAddress(
            id="t_dupont",
            label_full="1600 CONNECTICUT AVENUE NW",
            label_normalized="1600 connecticut avenue nw",
            lon=-77.038,
            lat=38.9107,
            geom=WKTElement("POINT(-77.038 38.9107)", srid=4326),
        ),
    )
    async with maker() as session:
        await session.execute(text("TRUNCATE TABLE dc_addresses"))
        session.add_all(seed_rows)
        await session.commit()

    yield engine

    async with maker() as session:
        await session.execute(text("TRUNCATE TABLE dc_addresses"))
        await session.commit()

    await engine.dispose()


@pytest_asyncio.fixture(loop_scope="module")
async def mar_session(_mar_engine: AsyncEngine) -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(_mar_engine, expire_on_commit=False)
    async with maker() as session:
        yield session


async def test_search_returns_kansas_for_partial_tokens(
    mar_session: AsyncSession,
) -> None:
    provider = LocalDcGeocodingProvider(mar_session)
    hits = await provider.search("4818 ka", limit=5)
    assert hits
    assert hits[0].label == "4818 KANSAS AVENUE NW"
    assert hits[0].id == "t_kansas"


async def test_reverse_returns_nearest_seed_row(mar_session: AsyncSession) -> None:
    provider = LocalDcGeocodingProvider(mar_session)
    hit = await provider.reverse(-77.02098615, 38.94896828)
    assert hit.id == "t_kansas"


async def test_reverse_rejects_far_away_coordinates(mar_session: AsyncSession) -> None:
    provider = LocalDcGeocodingProvider(mar_session)
    with pytest.raises(ScoutError) as ctx:
        await provider.reverse(2.3522, 48.8566)
    assert ctx.value.code == "UPSTREAM_UNAVAILABLE"


async def test_search_returns_empty_for_non_matching_query(
    mar_session: AsyncSession,
) -> None:
    provider = LocalDcGeocodingProvider(mar_session)
    hits = await provider.search("zzzzzzz nomatch", limit=5)
    assert hits == []
