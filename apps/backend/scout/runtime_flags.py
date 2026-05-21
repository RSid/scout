"""Runtime switches shared across imports (keep free of heavyweight deps)."""

from __future__ import annotations

import os


def scout_under_test() -> bool:
    """Unit tests toggle this env var before importing FastAPI lifespan hooks."""

    return os.getenv("SCOUT_UNDER_TEST", "0").strip().lower() in {"1", "true", "yes"}
