"""Typed routing payloads crossing the DEC-020 adapter boundary."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class UnverifiedSegment(BaseModel):
    """A stretch at one end of a wheelchair route that the wheelchair profile
    did not plan (M1-F04).

    Produced when the destination (or start) only connects to the street
    network by steps in the map data: Scout plans the wheelchair route to a
    nearby point on the street and covers the remaining stretch with the
    standard walking route, which may include steps.
    """

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    position: Literal["start", "end"]
    length_meters: float = Field(ge=0)
    geometry: dict[str, Any]
    """GeoJSON LineString, in travel direction (origin → destination)."""
    reason: Literal["endpoint_steps_only"] = "endpoint_steps_only"


class RoutingComputation(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    geojson_fc: dict[str, Any]
    distance_meters: float = Field(ge=0)
    duration_seconds: float = Field(ge=0)
    fallback_profile_used: bool = False
    warnings: tuple[str, ...] = ()
    unverified_segments: tuple[UnverifiedSegment, ...] = ()
