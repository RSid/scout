"""Request body byte cap for the public API (M1-F07 / M1-F12).

Pure ASGI middleware, so the cap applies before FastAPI parses JSON. Requests
that declare an oversize `Content-Length` are refused without reading the body;
requests without one (chunked uploads) are read up to the cap, refused if they
go over, and otherwise replayed to the app unchanged.
"""

from __future__ import annotations

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from scout.errors import RequestBodyTooLargeError

# The largest legitimate body is a `/api/route-features` request at the
# 5,000-point vertex cap: ~40 bytes per full-precision `[lon,lat],` pair is
# ~200 KB. 512 KB keeps >2x headroom while refusing multi-megabyte payloads.
MAX_REQUEST_BODY_BYTES = 512 * 1024

_METHODS_WITH_BODY = frozenset({"POST", "PUT", "PATCH"})


class RequestBodyLimitMiddleware:
    """Answer HTTP 413 `REQUEST_TOO_LARGE` for bodies over `max_body_bytes`."""

    def __init__(
        self, app: ASGIApp, *, max_body_bytes: int = MAX_REQUEST_BODY_BYTES
    ) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in _METHODS_WITH_BODY:
            await self.app(scope, receive, send)
            return

        declared = _declared_content_length(scope)
        if declared is not None and declared > self.max_body_bytes:
            await self._reject(scope, receive, send)
            return

        body = await _read_body_up_to(receive, self.max_body_bytes)
        if body is None:
            await self._reject(scope, receive, send)
            return
        await self.app(scope, _replay(body, receive), send)

    async def _reject(self, scope: Scope, receive: Receive, send: Send) -> None:
        exc = RequestBodyTooLargeError(maximum_bytes=self.max_body_bytes)
        response = JSONResponse(
            status_code=exc.status_code,
            content={"error": {"code": exc.code, "message": exc.message}},
            # Tell the client we are not reading the rest of the upload.
            headers={"Connection": "close"},
        )
        await response(scope, receive, send)


def _declared_content_length(scope: Scope) -> int | None:
    """Parsed `Content-Length`, or None when absent or unparseable."""

    for name, value in scope["headers"]:
        if name == b"content-length":
            try:
                return int(value)
            except ValueError:
                return None
    return None


async def _read_body_up_to(receive: Receive, limit: int) -> bytes | None:
    """Drain the request body; None as soon as it exceeds `limit` bytes."""

    chunks: list[bytes] = []
    total = 0
    more_body = True
    while more_body:
        message = await receive()
        if message["type"] != "http.request":
            break
        chunk = message.get("body", b"")
        total += len(chunk)
        if total > limit:
            return None
        chunks.append(chunk)
        more_body = message.get("more_body", False)
    return b"".join(chunks)


def _replay(body: bytes, receive: Receive) -> Receive:
    """A `receive` that yields the buffered body once, then defers upstream."""

    sent = False

    async def replay_receive() -> Message:
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        return await receive()

    return replay_receive
