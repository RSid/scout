"""Per-route IP rate limiting (M1-T17) via slowapi.

Rate limits keyed by Scout API route + client identity (derived from socket or a
trusted edge header configured per deployment).

Public API endpoints and default policies (env-specific tuning deferred to ops):
------------------------------------------------------------------------------
| Endpoint                    | METHOD | Policy key                       |
|-----------------------------|--------|----------------------------------|
| /api/route                  | POST   | POLICIES["route_post"]           |
| /api/route-features         | POST   | POLICIES["route_features_post"]  |
| /api/restrooms              | GET    | POLICIES["restrooms_get"]        |
| /api/categories             | GET    | POLICIES["categories_get"]       |
| /api/geocode/search         | GET    | POLICIES["geocode_get"]          |
| /api/geocode/reverse        | GET    | POLICIES["geocode_get"]          |
| /api/health                 | GET    | exempt — orchestrator probes     |

Cheap metadata endpoints may tighten or widen limits with an explicit rationale
in code comments; do not widen expensive POST/cache-miss pathways silently.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from scout.config import Settings
from scout.errors import scout_rate_limit_exceeded_handler

LOGGER = logging.getLogger("scout")


POLICIES: dict[str, str] = {
    "route_post": "30/minute",
    "route_features_post": "30/minute",
    "restrooms_get": "60/minute",
    "categories_get": "120/minute",
    "geocode_get": "30/minute",
}


def scout_key_func(request: Request) -> str:
    """Bucket key for limits: direct ``client.host`` or trusted forwarded header."""

    settings = request.app.state.settings
    if not isinstance(settings, Settings):
        return "unknown"
    if settings.trust_proxy_headers:
        name = settings.client_ip_header.strip()
        raw = request.headers.get(name)
        if raw is None:
            raw = next(
                (
                    val
                    for key, val in request.headers.items()
                    if key.lower() == name.lower()
                ),
                None,
            )
        if raw:
            return _leftmost_forwarded(raw)
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _leftmost_forwarded(value: str) -> str:
    """First hop in a comma-separated XFF-style chain."""

    return value.split(",")[0].strip()


limiter = Limiter(
    key_func=scout_key_func,
    default_limits=[],
    headers_enabled=True,
    enabled=True,
)


class RateAllowLogMiddleware(BaseHTTPMiddleware):
    """Emit INFO after scoped limit succeeds (slowapi exposes ``view_rate_limit``)."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        view = getattr(request.state, "view_rate_limit", None)
        if view is None or not limiter.enabled:
            return response
        request_id = request.headers.get("x-request-id") or ""
        rate_item = view[0]
        policy_repr = repr(rate_item)
        try:
            _, hits_left = limiter.limiter.get_window_stats(rate_item, *view[1])
            remaining = hits_left
        except Exception:
            remaining = None
        LOGGER.info(
            "ratelimit decision=allow route=%s policy=%s remaining=%s request_id=%s",
            request.url.path,
            policy_repr,
            remaining if remaining is not None else "unknown",
            request_id,
        )
        return response


def install_rate_limiter(app: FastAPI, settings_obj: Settings) -> None:
    limiter.enabled = settings_obj.rate_limit_enabled
    app.state.limiter = limiter
    app.add_middleware(SlowAPIMiddleware)
    app.add_middleware(RateAllowLogMiddleware)
    # Starlette's handler type covers WebSockets; Scout only installs an HTTP hook for
    # SlowAPI (`RateLimitExceeded`).
    app.add_exception_handler(
        RateLimitExceeded,
        scout_rate_limit_exceeded_handler,  # type: ignore[arg-type]
    )
