"""Unit tests for ORS quota back-off parsing and state (M1-F04)."""

from __future__ import annotations

import logging

import pytest

from scout.clients.routing.cooldown import (
    CooldownDecision,
    CooldownPolicy,
    QuotaSignal,
    RoutingCooldown,
    decide_cooldown,
    is_daily_quota_exhausted,
    parse_ratelimit_reset,
    parse_retry_after,
)

NOW = 1_800_000_000.0  # 2027-01-15T08:00:00Z, an arbitrary fixed epoch.
POLICY = CooldownPolicy()


class FakeClock:
    """Owned test double for the injected clock; advanced by hand."""

    def __init__(self, start: float = NOW) -> None:
        self.current = start

    def __call__(self) -> float:
        return self.current


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("120", 120.0),
        (" 30 ", 30.0),
        ("Fri, 15 Jan 2027 08:05:00 GMT", 300.0),
        ("99999999999999999999", 99999999999999999999.0),
    ],
)
def test_parse_retry_after_accepts_seconds_and_http_dates(
    value: str, expected: float
) -> None:
    assert parse_retry_after(value, now=NOW) == pytest.approx(expected)


@pytest.mark.parametrize(
    "value",
    [
        None,
        "",
        "soon",
        "-5",
        "0",
        "1.5",
        "²",
        "Thu, 14 Jan 2027 08:00:00 GMT",  # already in the past
        "Fri, 15 Jan 2027 08:05:00",  # no timezone
    ],
)
def test_parse_retry_after_rejects_garbage(value: str | None) -> None:
    assert parse_retry_after(value, now=NOW) is None


def test_parse_ratelimit_reset_reads_epoch_seconds() -> None:
    assert parse_ratelimit_reset(str(int(NOW) + 900), now=NOW) == pytest.approx(900)


@pytest.mark.parametrize(
    "value",
    [None, "", "tomorrow", "nan", "inf", "-inf", str(int(NOW) - 1), "0"],
)
def test_parse_ratelimit_reset_rejects_garbage(value: str | None) -> None:
    assert parse_ratelimit_reset(value, now=NOW) is None


@pytest.mark.parametrize(
    ("status_code", "headers", "expected"),
    [
        (403, {"x-ratelimit-remaining": "0"}, True),
        (403, {"x-ratelimit-remaining": "12"}, False),
        (403, {}, False),
        (429, {"x-ratelimit-remaining": "0"}, False),
        (200, {"x-ratelimit-remaining": "0"}, False),
    ],
)
def test_is_daily_quota_exhausted_only_for_403_with_nothing_left(
    status_code: int, headers: dict[str, str], expected: bool
) -> None:
    assert is_daily_quota_exhausted(status_code, headers) is expected


@pytest.mark.parametrize(
    ("signal", "headers", "expected"),
    [
        # Per-minute limit (429)
        (QuotaSignal.PER_MINUTE, {}, CooldownDecision(60.0, "default")),
        (
            QuotaSignal.PER_MINUTE,
            {"retry-after": "20"},
            CooldownDecision(20.0, "retry_after"),
        ),
        (
            QuotaSignal.PER_MINUTE,
            {"retry-after": "garbage"},
            CooldownDecision(60.0, "default"),
        ),
        (
            QuotaSignal.PER_MINUTE,
            {"retry-after": "86400"},
            CooldownDecision(900.0, "retry_after"),
        ),
        (
            # The daily reset header must not stretch a per-minute back-off.
            QuotaSignal.PER_MINUTE,
            {"x-ratelimit-reset": str(int(NOW) + 50_000)},
            CooldownDecision(60.0, "default"),
        ),
        # Daily quota (403 + remaining 0)
        (QuotaSignal.DAILY, {}, CooldownDecision(3600.0, "default")),
        (
            QuotaSignal.DAILY,
            {"x-ratelimit-reset": str(int(NOW) + 7200)},
            CooldownDecision(7200.0, "ratelimit_reset"),
        ),
        (
            QuotaSignal.DAILY,
            {"x-ratelimit-reset": str(int(NOW) * 1000)},  # milliseconds by mistake
            CooldownDecision(86400.0, "ratelimit_reset"),
        ),
        (
            QuotaSignal.DAILY,
            {"x-ratelimit-reset": "not-a-time"},
            CooldownDecision(3600.0, "default"),
        ),
        (
            QuotaSignal.DAILY,
            {"retry-after": "600", "x-ratelimit-reset": str(int(NOW) + 7200)},
            CooldownDecision(600.0, "retry_after"),
        ),
    ],
)
def test_decide_cooldown_picks_hint_default_or_cap(
    signal: QuotaSignal, headers: dict[str, str], expected: CooldownDecision
) -> None:
    assert decide_cooldown(signal, headers, now=NOW, policy=POLICY) == expected


def test_decide_cooldown_never_shorter_than_one_second() -> None:
    reset_in_a_blink = {"x-ratelimit-reset": str(NOW + 0.2)}

    decision = decide_cooldown(
        QuotaSignal.DAILY, reset_in_a_blink, now=NOW, policy=POLICY
    )

    assert decision.seconds == 1.0


def test_cooldown_starts_closed() -> None:
    assert RoutingCooldown(clock=FakeClock()).seconds_remaining() is None


def test_cooldown_open_reports_seconds_remaining() -> None:
    clock = FakeClock()
    cooldown = RoutingCooldown(clock=clock)
    cooldown.open(QuotaSignal.PER_MINUTE, CooldownDecision(60.0, "default"))

    clock.current += 15.5

    assert cooldown.seconds_remaining() == 45


def test_cooldown_closes_once_reset_time_passes() -> None:
    clock = FakeClock()
    cooldown = RoutingCooldown(clock=clock)
    cooldown.open(QuotaSignal.PER_MINUTE, CooldownDecision(60.0, "default"))

    clock.current += 60.0

    assert cooldown.seconds_remaining() is None


def test_cooldown_reopen_never_shortens_existing_window() -> None:
    clock = FakeClock()
    cooldown = RoutingCooldown(clock=clock)
    cooldown.open(QuotaSignal.DAILY, CooldownDecision(3600.0, "default"))

    remaining = cooldown.open(QuotaSignal.PER_MINUTE, CooldownDecision(60.0, "default"))

    assert remaining == 3600


def test_cooldown_logs_open_without_request_details(
    caplog: pytest.LogCaptureFixture,
) -> None:
    cooldown = RoutingCooldown(clock=FakeClock())

    with caplog.at_level(logging.WARNING, logger="scout"):
        cooldown.open(QuotaSignal.PER_MINUTE, CooldownDecision(60.0, "default"))

    record = next(r for r in caplog.records if r.message == "routing_cooldown_open")
    assert (record.reason, record.cooldown_seconds, record.cooldown_source) == (
        "per_minute_limit",
        60.0,
        "default",
    )


def test_cooldown_logs_short_circuited_count_on_close(
    caplog: pytest.LogCaptureFixture,
) -> None:
    clock = FakeClock()
    cooldown = RoutingCooldown(clock=clock)
    cooldown.open(QuotaSignal.PER_MINUTE, CooldownDecision(60.0, "default"))
    for _ in range(3):
        cooldown.seconds_remaining()
    clock.current += 61.0

    with caplog.at_level(logging.INFO, logger="scout"):
        cooldown.seconds_remaining()

    record = next(r for r in caplog.records if r.message == "routing_cooldown_closed")
    assert record.short_circuited_count == 3
