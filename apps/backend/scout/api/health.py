"""Liveness probes for orchestrators."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from scout.data.schema import HealthResponse
from scout.data.session import get_session

router = APIRouter(tags=["health"])

# Rate limit exempt (M1-T17): health is a cheap probe for orchestrators; must stay
# high-throughput.


async def _probe_features_table(session: AsyncSession) -> tuple[bool, int | None]:
    try:
        await session.execute(text("SELECT 1"))
        counted = await session.execute(text("SELECT count(*) FROM features"))
        return True, int(counted.scalar_one())
    except Exception:
        return False, None


@router.get("/health")
async def read_health(
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JSONResponse:
    checked_at = datetime.now(tz=UTC)
    reachable, features = await _probe_features_table(session)
    if reachable:
        body = HealthResponse(db="up", features=features, checked_at=checked_at)
        return JSONResponse(
            status_code=200,
            content=body.model_dump(mode="json"),
            headers={"Cache-Control": "public, max-age=30"},
        )
    body = HealthResponse(db="down", features=None, checked_at=checked_at)
    return JSONResponse(status_code=503, content=body.model_dump(mode="json"))
