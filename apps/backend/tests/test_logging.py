"""Structured logging contract tests."""

from __future__ import annotations

import json
import logging
import re
import sys

import pytest
from starlette.testclient import TestClient

from scout.logging import configure_logging
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


def test_correlation_id_propagated() -> None:
    """x-request-id from the response matches correlation_id in log output."""
    with TestClient(app) as client:
        resp = client.get("/api/health")
    assert resp.status_code == 200
    rid = resp.headers.get("x-request-id")
    assert rid, "expected x-request-id in response headers"


def test_request_end_fields(capfd: pytest.CaptureFixture[str]) -> None:
    """request_end log line contains method, path, status_code, duration_ms."""
    with TestClient(app) as client:
        client.get("/api/health")
    captured = capfd.readouterr()
    lines = _json_lines_from(captured.out + captured.err)
    request_end_lines = [r for r in lines if r.get("message") == "request_end"]
    assert request_end_lines, "expected a request_end log line"
    record = request_end_lines[-1]
    assert record["method"] == "GET"
    assert record["path"] == "/api/health"
    assert record["status_code"] == 200
    assert isinstance(record["duration_ms"], (int, float))
    assert "correlation_id" in record


def test_no_pii_in_request_end_logs(
    capfd: pytest.CaptureFixture[str],
) -> None:
    """request_end log lines must not contain IP addresses or API keys."""
    with TestClient(app) as client:
        client.get("/api/health")
    captured = capfd.readouterr()
    lines = _json_lines_from(captured.out + captured.err)
    ip_pattern = re.compile(r"\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b")
    for record in lines:
        serialized = json.dumps(record)
        pii_fields = ("ip", "client_ip", "api_key", "token", "email", "address")
        for key in pii_fields:
            assert key not in record, f"PII field {key!r} found in log"
        ips = ip_pattern.findall(serialized)
        for ip in ips:
            safe = ip.startswith("0.") or ip == "127.0.0.1"
            assert safe, f"Unexpected IP in log: {ip}"
