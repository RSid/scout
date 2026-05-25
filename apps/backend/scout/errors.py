"""Scout-facing exception hierarchy and HTTP mapping."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.responses import Response

LOGGER = logging.getLogger("scout")

ROUTE_SERVICE_DEFAULT_USER_MESSAGE = (
    "Routing is taking longer than usual. You can wait or pick a closer destination."
)


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
    def __init__(self, *, message: str = "No route found") -> None:
        super().__init__(code="ROUTE_NOT_FOUND", message=message, status_code=404)


class RouteServiceUnavailableError(ScoutError):
    def __init__(
        self,
        *,
        message: str = ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
    ) -> None:
        super().__init__(
            code="ROUTE_SERVICE_UNAVAILABLE",
            message=message,
            status_code=502,
        )


class UpstreamUnavailableError(ScoutError):
    def __init__(
        self,
        *,
        message: str = "An upstream dependency is unavailable. Try again later.",
    ) -> None:
        super().__init__(code="UPSTREAM_UNAVAILABLE", message=message, status_code=503)


class RateLimitedError(ScoutError):
    """HTTP 429 with stable Scout error code."""

    def __init__(
        self,
        *,
        message: str = "Too many requests. Try again shortly.",
        retry_after_seconds: int | None = None,
    ) -> None:
        self.retry_after_seconds = retry_after_seconds
        super().__init__(code="RATE_LIMIT", message=message, status_code=429)


async def scout_rate_limit_exceeded_handler(
    request: Request, exc: RateLimitExceeded
) -> Response:
    """Map slowapi's exception to Scout JSON + Retry-After (via limiter injector)."""

    from scout.security.rate_limit import limiter

    bounded = getattr(exc, "limit", None)
    policy_repr = repr(bounded.limit) if bounded is not None else "unknown"
    request_id = request.headers.get("x-request-id") or ""
    LOGGER.warning(
        "ratelimit decision=deny route=%s policy=%s remaining=%s request_id=%s",
        request.url.path,
        policy_repr,
        0,
        request_id,
    )
    scout_exc = RateLimitedError()
    response: Response = JSONResponse(
        status_code=scout_exc.status_code,
        content={"error": {"code": scout_exc.code, "message": scout_exc.message}},
    )
    injected: Response = limiter._inject_headers(
        response, request.state.view_rate_limit
    )
    return injected


def _first_validation_issue_message(exc: RequestValidationError) -> str:
    """Single-sentence summary for HTTP 400 (voice-and-copy, no codes to users)."""

    errors = exc.errors()
    if not errors:
        return "Some input could not be read."
    row = errors[0]
    loc_bits = [str(part) for part in row.get("loc", ()) if part not in ("body",)]
    suffix = ""
    if loc_bits:
        suffix = " (" + ", ".join(loc_bits) + ")"
    detail = row.get("msg")
    raw = (
        detail if isinstance(detail, str) else "Something in the request was not valid."
    )
    return f"{raw}{suffix}".strip()


def register_exception_handlers(app: FastAPI) -> None:
    """Wire canonical `{ \"error\": { code, message } }` envelopes."""

    @app.exception_handler(RequestValidationError)
    async def _validation_exc(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        del _request
        return JSONResponse(
            status_code=400,
            content={
                "error": {
                    "code": "INVALID_INPUT",
                    "message": _first_validation_issue_message(exc),
                }
            },
        )

    @app.exception_handler(ScoutError)
    async def _scout_exc(_request: Any, exc: ScoutError) -> JSONResponse:
        del _request
        response = JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
        )
        if isinstance(exc, RateLimitedError) and exc.retry_after_seconds is not None:
            response.headers["Retry-After"] = str(exc.retry_after_seconds)
        return response
