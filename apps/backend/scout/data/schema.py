"""Pydantic API shapes (frozen + strict boundaries)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

from scout.data.region import in_dc_service_area


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
        if not in_dc_service_area(lon, lat):
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
    feature_count_total: int


class CorridorPointGeoJSON(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["Point"] = "Point"
    coordinates: Annotated[list[float], Field(min_length=2, max_length=2)]


class CorridorFeatureProperties(BaseModel):
    """Normalized `Feature.properties` plus `along_route_meters`
    (appendix §A + M1-F07.S3)."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: str
    category: str
    kind: Literal["obstacle", "aid"]
    condition: str | None
    condition_normalized: str
    inspected_year: int | None = Field(ge=1900, le=2100)
    source_dataset: str
    source_id: str
    attributes: dict[str, Any]
    along_route_meters: float
    # Nearest DC street-centerline name (DEC-027 / M2-F24). Null for restrooms
    # and any feature with no segment within range. Defaulted so the restroom
    # merge path (which never sets it) still validates.
    street_name: str | None = None


class CorridorGeoJSONFeature(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["Feature"] = "Feature"
    geometry: CorridorPointGeoJSON
    properties: CorridorFeatureProperties


class CorridorResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[CorridorGeoJSONFeature]
    meta: CorridorMeta


# One GeoJSON position: exactly (lon, lat) as finite JSON numbers. Strict mode
# rejects numeric strings rather than coercing them; NaN/Infinity (which
# Python's JSON parser accepts) are rejected as non-finite.
LonLatPosition = Annotated[
    list[Annotated[float, Field(allow_inf_nan=False)]],
    Field(min_length=2, max_length=2),
]


class CorridorLineString(BaseModel):
    """`route_geometry` for `POST /api/route-features` (GeoJSON LineString).

    Shape only. The vertex cap and the service-area check live in the handler
    so they can answer with their own error codes (M1-F07).
    """

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["LineString"]
    coordinates: Annotated[list[LonLatPosition], Field(min_length=2)]


class CorridorRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    route_geometry: CorridorLineString
    buffer_meters: int = Field(default=30, ge=1)
    categories: Annotated[list[str], Field(min_length=1)]


class RestroomFeatureProperties(BaseModel):
    """Normalized `Feature.properties` for a restroom (appendix §A + §B.8).

    Mirrors `CorridorFeatureProperties` minus `along_route_meters`, since the
    standalone restroom layer is not bound to a route.
    """

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: str
    category: Literal["restrooms"]
    kind: Literal["aid"]
    condition: str | None
    condition_normalized: str
    inspected_year: int | None = Field(ge=1900, le=2100)
    source_dataset: str
    source_id: str
    attributes: dict[str, Any]


class RestroomGeoJSONFeature(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["Feature"] = "Feature"
    geometry: CorridorPointGeoJSON
    properties: RestroomFeatureProperties


class RestroomsResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    type: Literal["FeatureCollection"] = "FeatureCollection"
    features: list[RestroomGeoJSONFeature]


class ApiAddressHit(BaseModel):
    """One geocoder result, Scout-domain shape (DEC-022).

    Mirrors `AddressHit` in `apps/web/lib/providers/geocoding/protocol.ts`
    so the contract is symmetric on both sides of the wire.
    """

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    id: str
    label: str
    lon: float
    lat: float


class GeocodeSearchResponse(BaseModel):
    """`GET /api/geocode/search`."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    hits: list[ApiAddressHit]


class GeocodeReverseResponse(BaseModel):
    """`GET /api/geocode/reverse`."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    hit: ApiAddressHit


class UtmEvent(BaseModel):
    """`POST /api/utm` — server-side UTM capture (no PII)."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    source: Annotated[str, Field(min_length=1, max_length=200)]
    medium: Annotated[str, Field(max_length=200)] = ""
    campaign: Annotated[str, Field(max_length=200)] = ""
