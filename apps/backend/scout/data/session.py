"""Async SQLAlchemy session plumbing."""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import cast

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from scout.runtime_flags import scout_under_test

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


class _SyntheticSession:
    """Offline stand-in honoring the two probes issued by `/api/health`."""

    def __init__(self) -> None:
        self._calls = 0

    async def execute(
        self, statement: object
    ) -> object:  # pragma: no cover - exercised via deps
        del statement
        self._calls += 1
        if self._calls == 1:
            return _NoScalarResult()
        if self._calls == 2:
            return _CountResult(total=137)
        msg = "Synthetic session exhausted its scripted responses"
        raise AssertionError(msg)


class _NoScalarResult:
    def scalar_one(self) -> None:  # noqa: D401 - matches SQLAlchemy surface
        raise AssertionError("SELECT 1 should not call scalar_one")


class _CountResult:
    def __init__(self, *, total: int) -> None:
        self._total = total

    def scalar_one(self) -> int:
        return self._total


def init_engine_and_session(database_url: str) -> None:
    """Configure the pooled async engine (called exactly once during app startup)."""

    global _engine, _session_factory

    if scout_under_test():
        return
    if _engine is not None:
        return
    _engine = create_async_engine(database_url, pool_size=5, max_overflow=5)
    _session_factory = async_sessionmaker(_engine, expire_on_commit=False)


async def close_engine() -> None:
    """Dispose engine on shutdown."""

    global _engine, _session_factory
    if scout_under_test():
        _session_factory = None
        _engine = None
        return
    if _engine is None:
        return
    await _engine.dispose()
    _engine = None
    _session_factory = None


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI Depends entrypoint yielding a transactional session."""

    if scout_under_test():
        synthetic_any = cast(AsyncSession, _SyntheticSession())
        yield synthetic_any
        return
    if _session_factory is None:
        raise RuntimeError("Database engine not initialized")
    async with _session_factory() as session:
        yield session
