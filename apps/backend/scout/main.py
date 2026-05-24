"""ASGI entrypoint configuring FastAPI routers and infrastructure."""

from __future__ import annotations

import logging
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from alembic.config import Config
from fastapi import FastAPI, Request
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import Response

from alembic import command
from scout.api.categories import router as categories_router
from scout.api.health import router as health_router
from scout.api.restrooms import router as restrooms_router
from scout.api.route import router as routing_router
from scout.api.route_features import router as route_features_router
from scout.config import (
    Settings,
    cors_origin_list,
    load_settings,
    migrate_sync_database_url,
)
from scout.data.session import close_engine, init_engine_and_session
from scout.errors import register_exception_handlers
from scout.runtime_flags import scout_under_test
from scout.security.rate_limit import install_rate_limiter

LOGGER = logging.getLogger("scout")


def configure_logging(level: str) -> None:
    """Baseline logging until M1-T19 expands structured payloads."""

    logging.basicConfig(level=getattr(logging, level.upper(), logging.INFO))


def run_startup_migrations(database_url: str) -> None:
    """Synchronously replay Alembic migrations before serving traffic."""

    cfg_path = Path(__file__).resolve().parents[1] / "alembic.ini"
    cfg = Config(str(cfg_path))
    cfg.set_main_option("sqlalchemy.url", migrate_sync_database_url(database_url))
    LOGGER.info("Running Alembic migrations")
    command.upgrade(cfg, "head")


def create_app(settings: Settings | None = None) -> FastAPI:
    """Application factory consumed by uvicorn/pytest."""

    resolved = settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        configure_logging(resolved.log_level)
        app.state.settings = resolved
        client = httpx.AsyncClient(timeout=30.0)
        app.state.http = client
        try:
            if not scout_under_test():
                init_engine_and_session(resolved.database_url)
                run_startup_migrations(resolved.database_url)
            yield
        finally:
            await client.aclose()
            await close_engine()

    app = FastAPI(
        lifespan=lifespan,
        title="Scout Accessibility API",
        version="0.1.0",
    )
    register_exception_handlers(app)
    install_rate_limiter(app, resolved)

    origins = cors_origin_list(resolved.cors_allowlist_csv)
    if origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=origins,
            allow_credentials=False,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.middleware("http")
    async def add_request_correlation_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        correlation = request.headers.get("x-request-id") or str(uuid.uuid4())
        response = await call_next(request)
        response.headers.setdefault("x-request-id", correlation)
        return response

    app.include_router(health_router, prefix="/api")
    app.include_router(categories_router, prefix="/api")
    app.include_router(routing_router, prefix="/api")
    app.include_router(route_features_router, prefix="/api")
    app.include_router(restrooms_router, prefix="/api")
    return app


app = create_app()
