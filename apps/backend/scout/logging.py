"""Structured JSON logging with automatic correlation-ID injection."""

from __future__ import annotations

import logging
import sys
from contextvars import ContextVar
from typing import Any, override

from pythonjsonlogger.json import JsonFormatter

correlation_id: ContextVar[str] = ContextVar("correlation_id", default="")


class _ScoutFormatter(JsonFormatter):
    @override
    def add_fields(
        self,
        log_record: dict[str, Any],
        record: logging.LogRecord,
        message_dict: dict[str, Any],
    ) -> None:
        super().add_fields(log_record, record, message_dict)
        log_record["level"] = record.levelname
        log_record["logger"] = record.name
        cid = correlation_id.get()
        if cid:
            log_record["correlation_id"] = cid


def configure_logging(level: str) -> None:
    """Replace the root logger's handler with a JSON formatter on stdout."""
    root = logging.getLogger()
    root.handlers.clear()
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        _ScoutFormatter(
            fmt="%(asctime)s %(levelname)s %(name)s %(message)s",
            rename_fields={"asctime": "timestamp"},
        )
    )
    root.addHandler(handler)
    root.setLevel(getattr(logging, level.upper(), logging.INFO))
