"""Pure normalization from DC OpenData GeoJSON features to ingest rows."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

GeoFeature = dict[str, object]

ConditionNorm = Literal[
    "blocking",
    "difficult",
    "mild",
    "good",
    "missing",
    "present",
    "absent",
    "n_a",
]
KindNorm = Literal["obstacle", "aid"]


@dataclass(frozen=True, slots=True)
class NormalizedRow:
    """Intermediate row aligned with `features` ORM minus server-side timestamps."""

    id: str
    category: str
    kind: str
    condition: str | None
    condition_normalized: str
    inspected_year: int | None
    source_dataset: str
    source_id: str
    attributes: dict[str, object]
    lon: float
    lat: float


@dataclass(frozen=True, slots=True)
class DatasetSpec:
    """One DC OpenData GeoJSON source."""

    id: str
    filename: str
    category: str
    source_dataset: str
    mapper: Callable[[GeoFeature], NormalizedRow | None]


def feature_id(source_dataset: str, source_id: str) -> str:
    return f"{source_dataset}:{source_id}"


def _point_lon_lat(geometry: object) -> tuple[float, float] | None:
    if not isinstance(geometry, dict):
        return None
    if geometry.get("type") != "Point":
        return None
    coords = geometry.get("coordinates")
    if not isinstance(coords, list) or len(coords) < 2:
        return None
    lon_o, lat_o = coords[0], coords[1]
    if not isinstance(lon_o, (int, float)) or not isinstance(lat_o, (int, float)):
        return None
    return float(lon_o), float(lat_o)


def _safe_str_props(props: dict[str, object], key: str) -> str | None:
    val = props.get(key)
    if val is None:
        return None
    if isinstance(val, str):
        return val if val.strip() else None
    return str(val)


def _inspected_year(props: dict[str, object]) -> int | None:
    raw = props.get("YEAR_INSPECTED")
    if isinstance(raw, bool):  # pragma: no cover - unrealistic for GeoJSON props
        return None
    if isinstance(raw, int):
        return raw if 1800 <= raw <= 2100 else None
    if isinstance(raw, float):
        y = int(raw)
        return y if 1800 <= y <= 2100 else None
    if isinstance(raw, str) and raw.strip().isdigit():
        y = int(raw.strip())
        return y if 1800 <= y <= 2100 else None
    return None


def _attrs_subset(props: dict[str, object], keys: tuple[str, ...]) -> dict[str, object]:
    out: dict[str, object] = {}
    for k in keys:
        if k not in props or props[k] is None:
            continue
        out[k] = props[k]
    return out


def _map_good_fair_noncompliant(
    condition: str | None,
) -> tuple[ConditionNorm, KindNorm]:
    if condition == "Good":
        return ("good", "aid")
    if condition == "Fair":
        return ("mild", "aid")
    if condition == "Non-Compliant":
        return ("blocking", "obstacle")
    if condition == "Missing":
        return ("missing", "obstacle")
    return ("n_a", "obstacle")


def normalize_curb_ramp(feature: GeoFeature) -> NormalizedRow | None:
    props_any = feature.get("properties") or {}
    if not isinstance(props_any, dict):
        return None
    props = {str(k): v for k, v in props_any.items()}
    geom_any = feature.get("geometry") or {}
    if not isinstance(geom_any, dict):
        return None
    pts = _point_lon_lat(geom_any)
    if pts is None:
        return None
    gid = _safe_str_props(props, "GIS_ID")
    if gid is None:
        return None
    cond_raw = _safe_str_props(props, "CONDITION")
    cn, kd = _map_good_fair_noncompliant(cond_raw)
    return NormalizedRow(
        id=feature_id("dc_ada_curb_ramp", gid),
        category="curb_ramps",
        kind=kd,
        condition=cond_raw,
        condition_normalized=cn,
        inspected_year=_inspected_year(props),
        source_dataset="dc_ada_curb_ramp",
        source_id=gid,
        attributes=_attrs_subset(
            props,
            ("ESTIMATED_YEAR_OF_IMPROVEMENT", "STATUS", "INTERSECTION_ID"),
        ),
        lon=pts[0],
        lat=pts[1],
    )


def _map_barrier_asset_type(raw: str | None) -> ConditionNorm:
    if raw is None:
        return "mild"
    key = raw.strip().lower()
    if key in {"vertical displacement", "horizontal displacement"}:
        return "difficult"
    if key in {"no sidewalk", "sidewalk ends"}:
        return "blocking"
    if key in {"sidewalk cracked", "pole"}:
        return "mild"
    return "mild"


def normalize_barrier(feature: GeoFeature) -> NormalizedRow | None:
    props_any = feature.get("properties") or {}
    if not isinstance(props_any, dict):
        return None
    props = {str(k): v for k, v in props_any.items()}
    geom_any = feature.get("geometry") or {}
    if not isinstance(geom_any, dict):
        return None
    pts = _point_lon_lat(geom_any)
    if pts is None:
        return None
    gid = _safe_str_props(props, "GIS_ID")
    if gid is None:
        return None
    asset_raw = _safe_str_props(props, "ASSET_TYPE")
    cn = _map_barrier_asset_type(asset_raw)
    attrs = _attrs_subset(
        props,
        ("ASSET_TYPE", "STATUS", "ESTIMATED_YEAR_OF_IMPROVEMENT", "INTERSECTION_ID"),
    )
    if asset_raw is not None:
        attrs["ASSET_TYPE_NORMALIZED"] = asset_raw.strip().lower()
    return NormalizedRow(
        id=feature_id("dc_ada_barriers", gid),
        category="barriers",
        kind="obstacle",
        condition=asset_raw,
        condition_normalized=cn,
        inspected_year=_inspected_year(props),
        source_dataset="dc_ada_barriers",
        source_id=gid,
        attributes=attrs,
        lon=pts[0],
        lat=pts[1],
    )


def _map_pushbutton(btn: str | None) -> tuple[ConditionNorm, KindNorm]:
    if btn == "Type C: Compliant version with Vibro-tactile and arrow":
        return ("present", "aid")
    if btn == "Type B: 3-inch button (non-compliant)":
        return ("difficult", "obstacle")
    if btn == "Type A : Old version (non-compliant)":
        return ("difficult", "obstacle")
    if btn == "None":
        return ("absent", "obstacle")
    return ("n_a", "obstacle")


def normalize_audible_signal(feature: GeoFeature) -> NormalizedRow | None:
    props_any = feature.get("properties") or {}
    if not isinstance(props_any, dict):
        return None
    props = {str(k): v for k, v in props_any.items()}
    geom_any = feature.get("geometry") or {}
    if not isinstance(geom_any, dict):
        return None
    pts = _point_lon_lat(geom_any)
    if pts is None:
        return None
    gid = _safe_str_props(props, "GIS_ID")
    if gid is None:
        return None
    btn = _safe_str_props(props, "PUSHBUTTON_TYPE")
    cn, kd = _map_pushbutton(btn)
    return NormalizedRow(
        id=feature_id("dc_ada_audible_signals", gid),
        category="audible_signals",
        kind=kd,
        condition=btn,
        condition_normalized=cn,
        inspected_year=_inspected_year(props),
        source_dataset="dc_ada_audible_signals",
        source_id=gid,
        attributes=_attrs_subset(
            props,
            ("PUSHBUTTON_TYPE", "INTERSECTION_ID", "ESTIMATED_YEAR_OF_IMPROVEMENT"),
        ),
        lon=pts[0],
        lat=pts[1],
    )


def normalize_bus_stop(feature: GeoFeature) -> NormalizedRow | None:
    props_any = feature.get("properties") or {}
    if not isinstance(props_any, dict):
        return None
    props = {str(k): v for k, v in props_any.items()}
    geom_any = feature.get("geometry") or {}
    if not isinstance(geom_any, dict):
        return None
    pts = _point_lon_lat(geom_any)
    if pts is None:
        return None
    gid = _safe_str_props(props, "GIS_ID")
    if gid is None:
        return None
    cond_raw = _safe_str_props(props, "CONDITION")
    cn, _base_kd = _map_good_fair_noncompliant(cond_raw)
    if cond_raw == "Good" or cond_raw == "Fair":
        kd: KindNorm = "aid"
    elif cond_raw == "Non-Compliant" or cond_raw == "Missing":
        kd = "obstacle"
    elif cond_raw is None:
        kd = "obstacle"
    else:
        kd = _base_kd
    attrs = _attrs_subset(
        props,
        ("ESTIMATED_YEAR_OF_IMPROVEMENT", "STATUS", "INTERSECTION_ID", "NOTES"),
    )
    return NormalizedRow(
        id=feature_id("dc_ada_bus_stop", gid),
        category="bus_stops",
        kind=kd,
        condition=cond_raw,
        condition_normalized=cn,
        inspected_year=_inspected_year(props),
        source_dataset="dc_ada_bus_stop",
        source_id=gid,
        attributes=attrs,
        lon=pts[0],
        lat=pts[1],
    )


def normalize_driveway(feature: GeoFeature) -> NormalizedRow | None:
    props_any = feature.get("properties") or {}
    if not isinstance(props_any, dict):
        return None
    props = {str(k): v for k, v in props_any.items()}
    geom_any = feature.get("geometry") or {}
    if not isinstance(geom_any, dict):
        return None
    pts = _point_lon_lat(geom_any)
    if pts is None:
        return None
    gid = _safe_str_props(props, "GIS_ID")
    if gid is None:
        return None
    cond_raw = _safe_str_props(props, "CONDITION")
    cn, kd = _map_good_fair_noncompliant(cond_raw)
    return NormalizedRow(
        id=feature_id("dc_ada_driveway", gid),
        category="driveways",
        kind=kd,
        condition=cond_raw,
        condition_normalized=cn,
        inspected_year=_inspected_year(props),
        source_dataset="dc_ada_driveway",
        source_id=gid,
        attributes=_attrs_subset(
            props,
            (
                "ESTIMATED_YEAR_OF_IMPROVEMENT",
                "STATUS",
                "STREETSEGID",
            ),
        ),
        lon=pts[0],
        lat=pts[1],
    )


def normalize_median_cut_through(feature: GeoFeature) -> NormalizedRow | None:
    props_any = feature.get("properties") or {}
    if not isinstance(props_any, dict):
        return None
    props = {str(k): v for k, v in props_any.items()}
    geom_any = feature.get("geometry") or {}
    if not isinstance(geom_any, dict):
        return None
    pts = _point_lon_lat(geom_any)
    if pts is None:
        return None
    gid = _safe_str_props(props, "GIS_ID")
    if gid is None:
        return None
    cond_raw = _safe_str_props(props, "CONDITION")
    cn_base, kd_base = _map_good_fair_noncompliant(cond_raw)
    if cond_raw == "Good" or cond_raw == "Fair":
        kd: KindNorm = "aid"
    else:
        kd = kd_base
    return NormalizedRow(
        id=feature_id("dc_ada_median_cut_through", gid),
        category="median_cut_throughs",
        kind=kd,
        condition=cond_raw,
        condition_normalized=cn_base,
        inspected_year=_inspected_year(props),
        source_dataset="dc_ada_median_cut_through",
        source_id=gid,
        attributes=_attrs_subset(
            props,
            ("ESTIMATED_YEAR_OF_IMPROVEMENT", "STATUS", "INTERSECTION_ID"),
        ),
        lon=pts[0],
        lat=pts[1],
    )


DATASETS: tuple[DatasetSpec, ...] = (
    DatasetSpec(
        id="ADA_Curb_Ramp.geojson",
        filename="ADA_Curb_Ramp.geojson",
        category="curb_ramps",
        source_dataset="dc_ada_curb_ramp",
        mapper=normalize_curb_ramp,
    ),
    DatasetSpec(
        id="ADA_Barriers_in_the_Public_Right_of_Way.geojson",
        filename="ADA_Barriers_in_the_Public_Right_of_Way.geojson",
        category="barriers",
        source_dataset="dc_ada_barriers",
        mapper=normalize_barrier,
    ),
    DatasetSpec(
        id="ADA_Audible_Pedestrian_Signals.geojson",
        filename="ADA_Audible_Pedestrian_Signals.geojson",
        category="audible_signals",
        source_dataset="dc_ada_audible_signals",
        mapper=normalize_audible_signal,
    ),
    DatasetSpec(
        id="ADA_Bus_Stop.geojson",
        filename="ADA_Bus_Stop.geojson",
        category="bus_stops",
        source_dataset="dc_ada_bus_stop",
        mapper=normalize_bus_stop,
    ),
    DatasetSpec(
        id="ADA_Driveway.geojson",
        filename="ADA_Driveway.geojson",
        category="driveways",
        source_dataset="dc_ada_driveway",
        mapper=normalize_driveway,
    ),
    DatasetSpec(
        id="ADA_Median_Cut_Through.geojson",
        filename="ADA_Median_Cut_Through.geojson",
        category="median_cut_throughs",
        source_dataset="dc_ada_median_cut_through",
        mapper=normalize_median_cut_through,
    ),
)


def load_geojson_feature_collection(
    raw: dict[str, object],
) -> tuple[list[GeoFeature], int]:
    """Return valid GeoJSON features and count of malformed / non-feature rows."""

    feats_any = raw.get("features")
    if not isinstance(feats_any, list):
        return [], 1
    out: list[GeoFeature] = []
    skipped = 0
    for item in feats_any:
        if not isinstance(item, dict):
            skipped += 1
            continue
        if item.get("type") != "Feature":
            skipped += 1
            continue
        out.append(dict(item.items()))
    return out, skipped
