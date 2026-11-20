"""`corridor_features_geojson` statement-timeout handling (M1-F07)."""

from __future__ import annotations

import asyncio
from typing import Any, cast

import pytest
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from scout.data.store import corridor_features_geojson
from scout.errors import CorridorQueryTimeoutError

_LINE = [[-77.05, 38.90], [-77.00, 38.95]]


class _DriverError(Exception):
    """Stands in for SQLAlchemy's adapted asyncpg error, which carries sqlstate."""

    def __init__(self, sqlstate: str) -> None:
        super().__init__(sqlstate)
        self.sqlstate = sqlstate


class _FailingSession:
    """Accepts `SET LOCAL`, then fails the first real query with `sqlstate`."""

    def __init__(self, sqlstate: str) -> None:
        self._sqlstate = sqlstate
        self.statements: list[str] = []

    async def execute(self, statement: Any) -> None:
        self.statements.append(str(statement))
        if len(self.statements) > 1:
            raise DBAPIError("SELECT", {}, _DriverError(self._sqlstate))


def _run_corridor(session: _FailingSession) -> None:
    # MOCK: a scripted session replaces asyncpg so the SQLSTATE -> Scout error
    # mapping is tested without a live Postgres.
    asyncio.run(
        corridor_features_geojson(
            cast(AsyncSession, session),
            coordinates=_LINE,
            categories=["curb_ramps"],
            buffer_meters=30.0,
            statement_timeout_ms=1234,
        )
    )


def test_query_canceled_maps_to_corridor_timeout() -> None:
    with pytest.raises(CorridorQueryTimeoutError):
        _run_corridor(_FailingSession("57014"))


def test_other_database_errors_propagate_unchanged() -> None:
    with pytest.raises(DBAPIError):
        _run_corridor(_FailingSession("53300"))


def test_timeout_is_set_local_to_the_transaction() -> None:
    session = _FailingSession("57014")
    with pytest.raises(CorridorQueryTimeoutError):
        _run_corridor(session)
    assert session.statements[0] == "SET LOCAL statement_timeout = 1234"
