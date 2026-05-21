"""Pytest bootstrap for the FastAPI scaffold."""

from __future__ import annotations

import os

os.environ.setdefault("SCOUT_UNDER_TEST", "1")
os.environ.setdefault("SCOUT_ROUTING_PROVIDER", "stub")
os.environ.setdefault("SCOUT_GEOCODING_PROVIDER", "stub")
os.environ.setdefault("SCOUT_RESTROOMS_PROVIDER", "stub")
os.environ.setdefault(
    "SCOUT_DATABASE_URL", "postgresql+asyncpg://scout:scout@localhost:6543/disabled"
)
