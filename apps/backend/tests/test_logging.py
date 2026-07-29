"""Structured logging contract tests."""

from __future__ import annotations

import json
import logging
import re
import sys
from typing import Any

import pytest
from starlette.testclient import TestClient

from scout.logging import configure_logging
from scout.main import app


class _CaptureHandler(logging.Handler):
    """Thread-safe handler that collects formatted log lines."""

    def __init__(self) -> None:
        super().__init__()
        self.records: list[dict[str, Any]] = []

    def emit(self, record: logging.LogRecord) -> None:
        text = self.format(record)
        if text.startswith("{"):
            self.records.append(json.loads(text))


def _install_capture_handler() -> _CaptureHandler:
    """Attach after lifespan has already called configure_logging."""
    root = logging.getLogger()
    handler = _CaptureHandler()
    if root.handlers:
        handler.setFormatter(root.handlers[0].formatter)
    root.addHandler(handler)
    return handler


def test_json_format_on_stdout(capsys: pytest.CaptureFixture[str]) -> None:
    """configure_logging produces valid JSON with required keys."""
    configure_logging("INFO")
    logger = logging.getLogger("scout.test")
    logger.info("hello")
    sys.stdout.flush()
    out = capsys.readouterr().out
    lines = [ln for ln in out.strip().splitlines() if ln.startswith("{")]
    assert lines, "expected at least one JSON log line"
    record = json.loads(lines[-1])
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
    lines = [ln for ln in out.strip().splitlines() if ln.startswith("{")]
    record = json.loads(lines[-1])
    assert record["cache_hit"] is True
    assert record["upstream_service"] == "ors"


def test_correlation_id_propagated() -> None:
    """x-request-id from the response matches correlation_id in log output."""
    with TestClient(app) as client:
        resp = client.get("/api/health")
    assert resp.status_code == 200
    rid = resp.headers.get("x-request-id")
    assert rid, "expected x-request-id in response headers"


def test_request_end_fields() -> None:
    """request_end log line contains method, path, status_code, duration_ms."""
    with TestClient(app) as client:
        handler = _install_capture_handler()
        client.get("/api/health")
    request_end_lines = [
        r for r in handler.records if r.get("message") == "request_end"
    ]
    assert request_end_lines, "expected a request_end log line"
    record = request_end_lines[-1]
    assert record["method"] == "GET"
    assert record["path"] == "/api/health"
    assert record["status_code"] == 200
    assert isinstance(record["duration_ms"], (int, float))
    assert "correlation_id" in record


def test_no_pii_in_request_end_logs() -> None:
    """request_end log lines must not contain IP addresses or API keys."""
    with TestClient(app) as client:
        handler = _install_capture_handler()
        client.get("/api/health")
    ip_pattern = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")
    for record in handler.records:
        serialized = json.dumps(record)
        pii_fields = ("ip", "client_ip", "api_key", "token", "email", "address")
        for key in pii_fields:
            assert key not in record, f"PII field {key!r} found in log"
        ips = ip_pattern.findall(serialized)
        for ip in ips:
            safe = ip.startswith("0.") or ip == "127.0.0.1"
            assert safe, f"Unexpected IP in log: {ip}"
