"""Back off from OpenRouteService after it tells us we are over quota (M1-F04).

ORS documents two quota signals for the hosted API
(https://giscience.github.io/openrouteservice/frequently-asked-questions.html):

- HTTP 429 when the per-minute limit (a sliding window) is exceeded.
- HTTP 403 when the daily limit is exceeded; the 24-hour window starts at
  the first request of the day, and ``x-ratelimit-remaining`` /
  ``x-ratelimit-reset`` describe it.

HeiGIT's terms warn that *repeatedly* exceeding limits can get the account
blocked, so once either signal arrives we stop calling ORS until the window
is likely to have reset.

State is in-process: one ``RoutingCooldown`` per adapter instance, and the
adapter lives on ``app.state`` for the app's lifespan. That is correct while
production runs a single uvicorn worker; multiple workers would each keep
their own cooldown (each still backs off after its own first quota error).
"""

from __future__ import annotations

import logging
import math
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from email.utils import parsedate_to_datetime
from enum import StrEnum

LOGGER = logging.getLogger("scout")

type Clock = Callable[[], float]
"""Returns the current time as Unix epoch seconds (``time.time`` in production)."""


class QuotaSignal(StrEnum):
    """Which ORS limit we ran into; logged as ``reason``."""

    PER_MINUTE = "per_minute_limit"
    DAILY = "daily_quota"


@dataclass(frozen=True)
class CooldownPolicy:
    """How long to stop calling ORS after each quota signal.

    Defaults:

    - Per-minute (429): ORS's window slides over 60 s, so 60 s is enough when
      the response gives no ``Retry-After``. Capped at 15 minutes so a buggy
      or hostile header can't take routing down for a day over a
      per-minute limit.
    - Daily (403 with ``x-ratelimit-remaining: 0``): the window is at most
      24 h long, so we never wait longer than that. Without a usable reset
      time we probe once an hour, which costs at most 24 extra upstream calls
      a day.
    """

    per_minute_default_seconds: float = 60.0
    per_minute_max_seconds: float = 15 * 60.0
    daily_default_seconds: float = 60 * 60.0
    daily_max_seconds: float = 24 * 60 * 60.0


@dataclass(frozen=True)
class CooldownDecision:
    """How long to back off and where that number came from (for logs)."""

    seconds: float
    source: str


def parse_retry_after(value: str | None, *, now: float) -> float | None:
    """Seconds to wait from an RFC 9110 ``Retry-After`` value, or ``None``.

    Accepts delta-seconds (``"120"``) or an HTTP-date. Anything unparseable,
    non-positive, or already in the past returns ``None`` so the caller falls
    back to its default.
    """

    if value is None:
        return None
    text = value.strip()
    if text.isascii() and text.isdigit():
        seconds = float(text)
    else:
        try:
            moment = parsedate_to_datetime(text)
        except (TypeError, ValueError):
            return None
        if moment.tzinfo is None:
            return None
        seconds = moment.timestamp() - now
    return seconds if seconds > 0 else None


def parse_ratelimit_reset(value: str | None, *, now: float) -> float | None:
    """Seconds until an ``x-ratelimit-reset`` Unix timestamp, or ``None``.

    ORS sends the reset time as Unix epoch seconds (UTC). Values that are not
    finite numbers, or that are not in the future, return ``None``.
    """

    if value is None:
        return None
    try:
        reset_at = float(value.strip())
    except ValueError:
        return None
    if not math.isfinite(reset_at):
        return None
    seconds = reset_at - now
    return seconds if seconds > 0 else None


def is_daily_quota_exhausted(status_code: int, headers: Mapping[str, str]) -> bool:
    """True for ORS's daily-limit 403 (as opposed to rejected credentials).

    ORS uses 403 both for "daily limit reached" and for credential problems.
    We only treat it as quota when the response also says nothing is left.
    """

    remaining = headers.get("x-ratelimit-remaining")
    return status_code == 403 and remaining is not None and remaining.strip() == "0"


def decide_cooldown(
    signal: QuotaSignal,
    headers: Mapping[str, str],
    *,
    now: float,
    policy: CooldownPolicy,
) -> CooldownDecision:
    """Pick the back-off length for a quota signal, clamped to the policy cap."""

    retry_after = parse_retry_after(headers.get("retry-after"), now=now)
    if signal is QuotaSignal.PER_MINUTE:
        default, cap = policy.per_minute_default_seconds, policy.per_minute_max_seconds
        hinted, source = retry_after, "retry_after"
    else:
        default, cap = policy.daily_default_seconds, policy.daily_max_seconds
        reset = parse_ratelimit_reset(headers.get("x-ratelimit-reset"), now=now)
        hinted, source = (
            (retry_after, "retry_after")
            if retry_after is not None
            else (reset, "ratelimit_reset")
        )
    if hinted is None:
        return CooldownDecision(seconds=default, source="default")
    return CooldownDecision(seconds=max(1.0, min(hinted, cap)), source=source)


class RoutingCooldown:
    """Open/closed switch that blocks ORS calls until a reset time passes."""

    def __init__(
        self,
        *,
        clock: Clock = time.time,
        policy: CooldownPolicy | None = None,
    ) -> None:
        self._clock = clock
        self.policy = policy or CooldownPolicy()
        self._open_until: float | None = None
        self._opened_at: float | None = None
        self._short_circuited = 0

    def now(self) -> float:
        return self._clock()

    def seconds_remaining(self) -> int | None:
        """Whole seconds left in an open cooldown, or ``None`` when closed.

        Counts the call as short-circuited when open, and closes (and logs)
        the cooldown lazily once its reset time has passed.
        """

        if self._open_until is None:
            return None
        now = self._clock()
        if now >= self._open_until:
            self._close(now)
            return None
        self._short_circuited += 1
        return max(1, math.ceil(self._open_until - now))

    def open(self, signal: QuotaSignal, decision: CooldownDecision) -> int:
        """Start (or extend) the cooldown; returns whole seconds to wait."""

        now = self._clock()
        until = now + decision.seconds
        if self._open_until is None:
            self._opened_at = now
            LOGGER.warning(
                "routing_cooldown_open",
                extra={
                    "upstream_service": "openrouteservice",
                    "reason": str(signal),
                    "cooldown_seconds": round(decision.seconds, 1),
                    "cooldown_source": decision.source,
                },
            )
        if self._open_until is None or until > self._open_until:
            self._open_until = until
        return max(1, math.ceil(self._open_until - now))

    def _close(self, now: float) -> None:
        opened_at = self._opened_at if self._opened_at is not None else now
        LOGGER.info(
            "routing_cooldown_closed",
            extra={
                "upstream_service": "openrouteservice",
                "cooldown_seconds": round(now - opened_at, 1),
                "short_circuited_count": self._short_circuited,
            },
        )
        self._open_until = None
        self._opened_at = None
        self._short_circuited = 0
