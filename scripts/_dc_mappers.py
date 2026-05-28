"""Pure normalizers from raw DC OpenData / OSM Overpass features into the
Scout `features` row shape defined in `docs/appendix-data-schema.md` §A.

Every `normalize_*` function is a pure transform — GeoJSON / Overpass element
in, `MappedRow` out, no I/O. Tested independently of any database under
`apps/backend/tests/test_ingest_mappers.py`.

When adding a new dataset:

1. Document the source + mapping in `docs/appendix-data-schema.md`.
2. Add a `normalize_*` function here.
3. Register it in `DATASETS_ENABLED` below.
4. Add a parametrize row in `tests/test_ingest_mappers.py`.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any, Literal, TypedDict


class MappedRow(TypedDict):
    """Storage-ready normalized feature; geometry kept as lon/lat until upsert."""

    id: str
    category: str
    kind: str
    condition: str | None
    condition_normalized: str
    inspected_year: int | None
    source_dataset: str
    source_id: str
    attributes: dict[str, Any]
    lon: float
    lat: float


_CONDITION_GENERIC: Mapping[str, tuple[str, str]] = {
    "Good": ("good", "aid"),
    "Fair": ("mild", "aid"),
    "Non-Compliant": ("blocking", "obstacle"),
    "Missing": ("missing", "obstacle"),
}


def _condition_generic(value: str | None) -> tuple[str, str]:
    """Shared `CONDITION` mapping for appendix §§B.1, B.4, B.5, B.6.

    Returns ``(condition_normalized, kind)``.
    """

    if value is None:
        return ("n_a", "obstacle")
    return _CONDITION_GENERIC.get(value, ("n_a", "obstacle"))


_BARRIER_ASSET_TO_NORM: Mapping[str, str] = {
    "vertical displacement": "difficult",
    "horizontal displacement": "difficult",
    "no sidewalk": "blocking",
    "sidewalk ends": "blocking",
    "sidewalk cracked": "mild",
    "pole": "mild",
}


_AUDIBLE_TO_NORM: Mapping[str, tuple[str, str]] = {
    "Type C: Compliant version with Vibro-tactile and arrow": ("present", "aid"),
    "Type B: 3-inch button (non-compliant)": ("difficult", "obstacle"),
    "Type A : Old version (non-compliant)": ("difficult", "obstacle"),
    "None": ("absent", "obstacle"),
}


def _point_lonlat(raw: Mapping[str, Any]) -> tuple[float, float]:
    coords = raw["geometry"]["coordinates"]
    return float(coords[0]), float(coords[1])


def _row_id(source_dataset: str, source_id: str) -> str:
    return f"{source_dataset}:{source_id}"


def _required_str(props: Mapping[str, Any], field: str) -> str:
    value = props.get(field)
    if not isinstance(value, str) or not value:
        raise ValueError(f"Missing required string field {field!r}")
    return value


def _optional_year(
    props: Mapping[str, Any], field: str = "YEAR_INSPECTED"
) -> int | None:
    value = props.get(field)
    return int(value) if isinstance(value, int) else None


def normalize_curb_ramp(raw: Mapping[str, Any]) -> MappedRow:
    """`ADA_Curb_Ramp.geojson` → `curb_ramps` (appendix §B.1)."""

    props = raw["properties"]
    source_id = _required_str(props, "GIS_ID")
    condition = props.get("CONDITION")
    normalized, kind = _condition_generic(condition)
    lon, lat = _point_lonlat(raw)
    return MappedRow(
        id=_row_id("dc_ada_curb_ramp", source_id),
        category="curb_ramps",
        kind=kind,
        condition=condition,
        condition_normalized=normalized,
        inspected_year=_optional_year(props),
        source_dataset="dc_ada_curb_ramp",
        source_id=source_id,
        attributes={
            "ESTIMATED_YEAR_OF_IMPROVEMENT": props.get("ESTIMATED_YEAR_OF_IMPROVEMENT"),
            "STATUS": props.get("STATUS"),
        },
        lon=lon,
        lat=lat,
    )


def normalize_barriers(raw: Mapping[str, Any]) -> MappedRow:
    """`ADA_Barriers_in_the_Public_Right_of_Way.geojson` → `barriers` (appendix §B.2).

    Casing on `ASSET_TYPE` is inconsistent at source — normalize to lowercase
    before mapping (acceptance criterion in M1-F11).
    """

    props = raw["properties"]
    source_id = _required_str(props, "GIS_ID")
    raw_asset = props.get("ASSET_TYPE")
    normalized_asset = raw_asset.lower() if isinstance(raw_asset, str) else None
    condition_normalized = (
        _BARRIER_ASSET_TO_NORM.get(normalized_asset, "mild")
        if normalized_asset
        else "n_a"
    )
    lon, lat = _point_lonlat(raw)
    return MappedRow(
        id=_row_id("dc_ada_barriers", source_id),
        category="barriers",
        kind="obstacle",
        condition=raw_asset,
        condition_normalized=condition_normalized,
        inspected_year=_optional_year(props),
        source_dataset="dc_ada_barriers",
        source_id=source_id,
        attributes={
            "ASSET_TYPE_RAW": raw_asset,
            "ASSET_TYPE_NORMALIZED": normalized_asset,
            "STATUS": props.get("STATUS"),
            "ESTIMATED_YEAR_OF_IMPROVEMENT": props.get("ESTIMATED_YEAR_OF_IMPROVEMENT"),
        },
        lon=lon,
        lat=lat,
    )


def normalize_audible_signals(raw: Mapping[str, Any]) -> MappedRow:
    """`ADA_Audible_Pedestrian_Signals.geojson` → `audible_signals` (appendix §B.3)."""

    props = raw["properties"]
    source_id = _required_str(props, "GIS_ID")
    pushbutton = props.get("PUSHBUTTON_TYPE")
    if pushbutton is None:
        normalized, kind = ("n_a", "obstacle")
    else:
        normalized, kind = _AUDIBLE_TO_NORM.get(pushbutton, ("n_a", "obstacle"))
    lon, lat = _point_lonlat(raw)
    return MappedRow(
        id=_row_id("dc_ada_audible_signals", source_id),
        category="audible_signals",
        kind=kind,
        condition=pushbutton,
        condition_normalized=normalized,
        inspected_year=_optional_year(props),
        source_dataset="dc_ada_audible_signals",
        source_id=source_id,
        attributes={
            "PUSHBUTTON_TYPE": pushbutton,
            "INTERSECTION_ID": props.get("INTERSECTION_ID"),
            "ESTIMATED_YEAR_OF_IMPROVEMENT": props.get("ESTIMATED_YEAR_OF_IMPROVEMENT"),
        },
        lon=lon,
        lat=lat,
    )


def _normalize_generic_condition(
    raw: Mapping[str, Any], *, category: str, source_dataset: str
) -> MappedRow:
    props = raw["properties"]
    source_id = _required_str(props, "GIS_ID")
    condition = props.get("CONDITION")
    normalized, kind = _condition_generic(condition)
    lon, lat = _point_lonlat(raw)
    return MappedRow(
        id=_row_id(source_dataset, source_id),
        category=category,
        kind=kind,
        condition=condition,
        condition_normalized=normalized,
        inspected_year=_optional_year(props),
        source_dataset=source_dataset,
        source_id=source_id,
        attributes={
            "STATUS": props.get("STATUS"),
            "ESTIMATED_YEAR_OF_IMPROVEMENT": props.get("ESTIMATED_YEAR_OF_IMPROVEMENT"),
        },
        lon=lon,
        lat=lat,
    )


def normalize_bus_stop(raw: Mapping[str, Any]) -> MappedRow:
    """`ADA_Bus_Stop.geojson` → `bus_stops` (appendix §B.4)."""

    return _normalize_generic_condition(
        raw, category="bus_stops", source_dataset="dc_ada_bus_stop"
    )


def normalize_driveway(raw: Mapping[str, Any]) -> MappedRow:
    """`ADA_Driveway.geojson` → `driveways` (appendix §B.5)."""

    return _normalize_generic_condition(
        raw, category="driveways", source_dataset="dc_ada_driveway"
    )


def normalize_median_cut_through(raw: Mapping[str, Any]) -> MappedRow:
    """`ADA_Median_Cut_Through.geojson` → `median_cut_throughs` (appendix §B.6)."""

    return _normalize_generic_condition(
        raw,
        category="median_cut_throughs",
        source_dataset="dc_ada_median_cut_through",
    )


OsmAmenity = Literal["bench", "drinking_water"]
_OSM_AMENITY_TO_CATEGORY: Mapping[OsmAmenity, str] = {
    "bench": "rest_spots",
    "drinking_water": "water_cooling",
}


def normalize_osm_amenity(
    raw_node: Mapping[str, Any], *, amenity: OsmAmenity
) -> MappedRow:
    """OSM Overpass node → `rest_spots` | `water_cooling` (appendix §B.9)."""

    category = _OSM_AMENITY_TO_CATEGORY[amenity]
    source_dataset = f"osm_overpass_{amenity}"
    osm_id = raw_node["id"]
    source_id = f"osm:node/{osm_id}"
    tags: dict[str, Any] = dict(raw_node.get("tags") or {})
    check_date = tags.get("check_date")
    inspected_year: int | None = None
    if (
        isinstance(check_date, str)
        and len(check_date) >= 4
        and check_date[:4].isdigit()
    ):
        inspected_year = int(check_date[:4])
    return MappedRow(
        id=_row_id(source_dataset, source_id),
        category=category,
        kind="aid",
        condition=None,
        condition_normalized="present",
        inspected_year=inspected_year,
        source_dataset=source_dataset,
        source_id=source_id,
        attributes={"tags": tags},
        lon=float(raw_node["lon"]),
        lat=float(raw_node["lat"]),
    )


@dataclass(frozen=True)
class IngestSource:
    """A DC OpenData GeoJSON registered for ingestion."""

    path: str
    source_dataset: str
    category: str
    normalize: Callable[[Mapping[str, Any]], MappedRow]


@dataclass(frozen=True)
class SkippedSource:
    """A GeoJSON kept on disk but deliberately not ingested in M1."""

    path: str
    source_dataset: str
    reason: str


DATASETS_ENABLED: tuple[IngestSource, ...] = (
    IngestSource(
        "data/ADA_Curb_Ramp.geojson",
        "dc_ada_curb_ramp",
        "curb_ramps",
        normalize_curb_ramp,
    ),
    IngestSource(
        "data/ADA_Barriers_in_the_Public_Right_of_Way.geojson",
        "dc_ada_barriers",
        "barriers",
        normalize_barriers,
    ),
    IngestSource(
        "data/ADA_Audible_Pedestrian_Signals.geojson",
        "dc_ada_audible_signals",
        "audible_signals",
        normalize_audible_signals,
    ),
    IngestSource(
        "data/ADA_Bus_Stop.geojson",
        "dc_ada_bus_stop",
        "bus_stops",
        normalize_bus_stop,
    ),
    IngestSource(
        "data/ADA_Driveway.geojson",
        "dc_ada_driveway",
        "driveways",
        normalize_driveway,
    ),
    IngestSource(
        "data/ADA_Median_Cut_Through.geojson",
        "dc_ada_median_cut_through",
        "median_cut_throughs",
        normalize_median_cut_through,
    ),
)


DATASETS_SKIPPED: tuple[SkippedSource, ...] = (
    SkippedSource(
        "data/Accessible_Parking_Zones.geojson",
        "dc_accessible_parking_zones",
        "166/203 records flagged ERROR — appendix-data-schema.md §B.7.",
    ),
)
