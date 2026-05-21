"""Scout-facing exception hierarchy and HTTP mapping."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse


class ScoutError(Exception):
    """Base type for Scout errors surfaced to callers."""

    def __init__(self, *, code: str, message: str, status_code: int = 400) -> None:
        self.code = code
        self.message = message
        self.status_code = status_code
        super().__init__(message)


class InvalidInputError(ScoutError):
    def __init__(
        self, *, message: str = "Some input was invalid.", code: str = "INVALID_INPUT"
    ) -> None:
        super().__init__(code=code, message=message, status_code=400)


class RouteNotFoundError(ScoutError):
    def __init__(
        self, *, message: str = "We couldn't find a walkable route for that pairing."
    ) -> None:
        super().__init__(code="ROUTE_NOT_FOUND", message=message, status_code=404)


class UpstreamUnavailableError(ScoutError):
    def __init__(
        self,
        *,
        message: str = "An upstream dependency is unavailable. Try again later.",
    ) -> None:
        super().__init__(code="UPSTREAM_UNAVAILABLE", message=message, status_code=503)


def register_exception_handlers(app: FastAPI) -> None:
    """Wire canonical `{ \"error\": { code, message } }` envelopes."""

    @app.exception_handler(ScoutError)
    async def _scout_exc(_request: Any, exc: ScoutError) -> JSONResponse:
        del _request
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )
