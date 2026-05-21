"""Shared dependency wiring helpers."""

from __future__ import annotations

from typing import Annotated, cast

import httpx
from fastapi import Depends, Request

from scout.config import Settings
from scout.runtime_flags import scout_under_test

__all__ = [
    "HttpDepends",
    "SettingsDepends",
    "retrieve_http_client",
    "retrieve_settings",
    "scout_under_test",
]


async def retrieve_settings(request: Request) -> Settings:
    """Return the lifespan-bound Settings object."""

    return cast(Settings, request.app.state.settings)


async def retrieve_http_client(request: Request) -> httpx.AsyncClient:
    return cast(httpx.AsyncClient, request.app.state.http)


SettingsDepends = Annotated[Settings, Depends(retrieve_settings)]
HttpDepends = Annotated[httpx.AsyncClient, Depends(retrieve_http_client)]
