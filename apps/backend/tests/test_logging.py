"""Structured logging contract tests."""

from __future__ import annotations

import json
import logging
import re
import sys

import pytest
from starlette.testclient import TestClient

from scout.logging import configure_logging, correlation_id
from scout.main import app


def _json_lines_from(output: str) -> list[dict[str, object]]:
    return [json.loads(ln) for ln in output.splitlines() if ln.startswith("{")]


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


def test_correlation_id_in_log(capsys: pytest.CaptureFixture[str]) -> None:
    """When the ContextVar is set, correlation_id appears in JSON output."""
    configure_logging("INFO")
    token = correlation_id.set("test-cid-123")
    try:
        logging.getLogger("scout.test.cid").info("with_cid")
    finally:
        correlation_id.reset(token)
    sys.stdout.flush()
    out = capsys.readouterr().out
    lines = _json_lines_from(out)
    assert lines[-1]["correlation_id"] == "test-cid-123"


def test_request_end_shape(capsys: pytest.CaptureFixture[str]) -> None:
    """A request_end log with middleware-style extra fields formats correctly."""
    configure_logging("INFO")
    token = correlation_id.set("shape-test-id")
    try:
        logging.getLogger("scout").info(
            "request_end",
            extra={
                "method": "GET",
                "path": "/api/health",
                "status_code": 200,
                "duration_ms": 12.34,
            },
        )
    finally:
        correlation_id.reset(token)
    sys.stdout.flush()
    out = capsys.readouterr().out
    lines = _json_lines_from(out)
    record = lines[-1]
    assert record["message"] == "request_end"
    assert record["method"] == "GET"
    assert record["path"] == "/api/health"
    assert record["status_code"] == 200
    assert record["duration_ms"] == 12.34
    assert record["correlation_id"] == "shape-test-id"


def test_correlation_id_on_response() -> None:
    """Middleware sets x-request-id on every response."""
    with TestClient(app) as client:
        resp = client.get("/api/health")
    assert resp.status_code == 200
    rid = resp.headers.get("x-request-id")
    assert rid, "expected x-request-id in response headers"


def test_no_pii_fields(capsys: pytest.CaptureFixture[str]) -> None:
    """Log records must not contain PII fields."""
    configure_logging("INFO")
    logging.getLogger("scout").info(
        "request_end",
        extra={
            "method": "GET",
            "path": "/api/health",
            "status_code": 200,
            "duration_ms": 5.0,
        },
    )
    sys.stdout.flush()
    out = capsys.readouterr().out
    ip_pattern = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")
    for line_str in out.splitlines():
        if not line_str.startswith("{"):
            continue
        record = json.loads(line_str)
        pii_fields = ("ip", "client_ip", "api_key", "token", "email", "address")
        for key in pii_fields:
            assert key not in record, f"PII field {key!r} found in log"
        for ip in ip_pattern.findall(json.dumps(record)):
            safe = ip.startswith("0.") or ip == "127.0.0.1"
            assert safe, f"Unexpected IP in log: {ip}"
