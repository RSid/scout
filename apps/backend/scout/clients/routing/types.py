"""Typed routing payloads crossing the DEC-020 adapter boundary."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class RoutingComputation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    geojson_fc: dict[str, Any]
    distance_meters: float = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    fallback_profile_used: bool = False
    warnings: tuple[str, ...] = ()
