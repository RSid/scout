"""Pydantic API shapes (frozen + strict boundaries)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator


class HealthResponse(BaseModel):
    """`GET /api/health`."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    status: Literal["ok"] = "ok"
    db: Literal["up", "down"]
    features: int | None = None
    checked_at: datetime


class ApiCategory(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: str
    label: str
    description: str
    kind: Literal["obstacle", "aid"]
    default_enabled: bool


class CategoriesResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    categories: list[ApiCategory]


class RouteComputeRequest(BaseModel):
    """`POST /api/route` inbound JSON."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    frm: Annotated[
        list[float],
        Field(
            validation_alias=AliasChoices("from", "frm"),
            serialization_alias="from",
            min_length=2,
            max_length=2,
        ),
    ]
    to: Annotated[list[float], Field(min_length=2, max_length=2)]
    profile: Literal["wheelchair"] = "wheelchair"

    @staticmethod
    def _assert_dc_lon_lat(endpoint: list[float], *, alias: str) -> None:
        lon, lat = float(endpoint[0]), float(endpoint[1])
        if not (-77.12 <= lon <= -76.91 and 38.79 <= lat <= 39.0):
            raise ValueError(f"Coordinate outside DC service area ({alias}).")

    @field_validator("frm")
    @classmethod
    def _frm_in_dc(cls, value: list[float]) -> list[float]:
        cls._assert_dc_lon_lat(value, alias="starting point")
        return value

    @field_validator("to")
    @classmethod
    def _to_in_dc(cls, value: list[float]) -> list[float]:
        cls._assert_dc_lon_lat(value, alias="destination")
        return value


class RouteResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]]


class CorridorMeta(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    truncated: bool
    time_taken_ms: float


class CorridorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]]
    meta: CorridorMeta


class CorridorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    route_geometry: dict[str, Any]
    buffer_meters: int = Field(default=30, ge=1, le=200)
    categories: Annotated[list[str], Field(min_length=1)]

    @field_validator("route_geometry")
    @classmethod
    def _linestring_kind(cls, val: dict[str, Any]) -> dict[str, Any]:
        """Reject unknown geometry payloads early."""

        if val.get("type") != "LineString":
            raise ValueError("route_geometry.type must be LineString")
        coords = val.get("coordinates")
        if (
            not isinstance(coords, list)
            or len(coords) < 2
            or not all(isinstance(p, list) and len(p) >= 2 for p in coords)
        ):
            raise ValueError(
                "route_geometry.coordinates must be a lon/lat list with length >= 2"
            )
        return val


class RestroomsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[dict[str, Any]]
