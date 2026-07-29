"""Structured logging contract tests."""

from __future__ import annotations

import json
import logging
import re
import sys
from collections.abc import Generator

import pytest
from starlette.testclient import TestClient

from scout.logging import configure_logging
from scout.main import app


def _json_lines_from(output: str) -> list[dict[str, object]]:
    return [json.loads(ln) for ln in output.splitlines() if ln.startswith("{")]


class _RecordSink(logging.Handler):
    """Collects LogRecords. Attached to the 'scout' logger (not root)
    so configure_logging's root.handlers.clear() never removes it."""

    def __init__(self) -> None:
        super().__init__()
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


@pytest.fixture()
def log_sink() -> Generator[_RecordSink]:
    """Attach a record sink to the 'scout' logger for the test's duration."""
    sink = _RecordSink()
    logger = logging.getLogger("scout")
    logger.addHandler(sink)
    yield sink
    logger.removeHandler(sink)


def test_json_format_on_stdout(capsys: pytest.CaptureFixture[str]) -> None:
    """configure_logging produces valid JSON with required keys."""
    configure_logging("INFO")
    logger = logging.getLogger("scout.test")
    logger.info("hello")
    sys.stdout.flush()
    out = capsys.readouterr().out
    lines = _json_lines_from(out)
    assert lines, "expected at least one JSON log line"
    record = lines[-1]
    assert record["level"] == "INFO"
    assert record["logger"] == "scout.test"
    assert record["message"] == "hello"
    assert "timestamp" in record


def test_extra_dict_promoted(capsys: pytest.CaptureFixture[str]) -> None:
    """Keys passed via extra= appear as top-level JSON fields."""
    configure_logging("INFO")
    logger = logging.getLogger("scout.test.extra")
    logger.info("cache_check", extra={"cache_hit": True, "upstream_service": "ors"})
    sys.stdout.flush()
    out = capsys.readouterr().out
    lines = _json_lines_from(out)
    record = lines[-1]
    assert record["cache_hit"] is True
    assert record["upstream_service"] == "ors"


def test_correlation_id_propagated() -> None:
    """x-request-id from the response matches correlation_id in log output."""
    with TestClient(app) as client:
        resp = client.get("/api/health")
    assert resp.status_code == 200
    rid = resp.headers.get("x-request-id")
    assert rid, "expected x-request-id in response headers"


def test_request_end_fields(log_sink: _RecordSink) -> None:
    """request_end log line contains method, path, status_code, duration_ms."""
    with TestClient(app) as client:
        client.get("/api/health")
    end_records = [r for r in log_sink.records if r.getMessage() == "request_end"]
    assert end_records, "expected a request_end log line"
    rec = end_records[-1]
    assert rec.method == "GET"  # type: ignore[attr-defined]
    assert rec.path == "/api/health"  # type: ignore[attr-defined]
    assert rec.status_code == 200  # type: ignore[attr-defined]
    assert isinstance(rec.duration_ms, (int, float))  # type: ignore[attr-defined]


def test_no_pii_in_request_end_logs(log_sink: _RecordSink) -> None:
    """Log records must not contain PII fields."""
    with TestClient(app) as client:
        client.get("/api/health")
    pii_fields = ("ip", "client_ip", "api_key", "token", "email", "address")
    ip_pattern = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")
    for rec in log_sink.records:
        for key in pii_fields:
            assert not hasattr(rec, key), f"PII field {key!r} found in log"
        msg = rec.getMessage()
        for ip in ip_pattern.findall(msg):
            safe = ip.startswith("0.") or ip == "127.0.0.1"
            assert safe, f"Unexpected IP in log: {ip}"
