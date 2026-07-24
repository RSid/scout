"""Privacy-first UTM visit tracking (aggregate counts only, no PII)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from scout.data.schema import UtmEvent
from scout.data.session import get_session
from scout.security.rate_limit import POLICIES, limiter

router = APIRouter(tags=["utm"])

POLICIES["utm_post"] = "10/minute"


@router.post("/utm")
@limiter.limit(POLICIES["utm_post"])
async def record_utm(
    payload: UtmEvent,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> JSONResponse:
    today = datetime.now(tz=UTC).date()
    await session.execute(
        text("""
            INSERT INTO utm_visits (source, medium, campaign, visited_date, hit_count)
            VALUES (:source, :medium, :campaign, :visited_date, 1)
            ON CONFLICT (source, medium, campaign, visited_date)
            DO UPDATE SET hit_count = utm_visits.hit_count + 1
        """),
        {
            "source": payload.source,
            "medium": payload.medium,
            "campaign": payload.campaign,
            "visited_date": today,
        },
    )
    await session.commit()
    return JSONResponse(status_code=204, content=None)
