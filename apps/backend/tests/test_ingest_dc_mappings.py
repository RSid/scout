"""Pure mapping coverage for DC OpenData → ``NormalizedRow``."""

from __future__ import annotations

import pytest

from scout.ingest.dc import (
    DATASETS,
    feature_id,
    load_geojson_feature_collection,
    normalize_audible_signal,
    normalize_barrier,
    normalize_bus_stop,
    normalize_curb_ramp,
    normalize_driveway,
    normalize_median_cut_through,
    normalize_sidewalk_condition,
)


def _point_feature(
    lon: float, lat: float, props: dict[str, object]
) -> dict[str, object]:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
        "properties": props,
    }


@pytest.mark.parametrize(
    ("gis_id", "condition", "normalized", "kind"),
    [
        ("ADA_CurbRampPt_demo_1", "Good", "good", "aid"),
        ("ADA_CurbRampPt_demo_2", None, "n_a", "obstacle"),
    ],
)
def test_curb_ramp_maps_condition_strings(
    gis_id: str, condition: str | None, normalized: str, kind: str
) -> None:
    props = {
        "GIS_ID": gis_id,
        "CONDITION": condition,
        "YEAR_INSPECTED": 2021,
        "ESTIMATED_YEAR_OF_IMPROVEMENT": None,
        "STATUS": None,
        "INTERSECTION_ID": "ix-9",
    }
    row = normalize_curb_ramp(_point_feature(-77.0, 38.9, props))
    assert (
        row is not None and row.condition_normalized == normalized and row.kind == kind
    )


def test_vertical_displacement_lower_case_is_difficult() -> None:
    props = {"GIS_ID": "barrier_lower", "ASSET_TYPE": "vertical displacement"}
    row = normalize_barrier(_point_feature(-77.03, 38.905, props))
    assert row is not None and row.condition_normalized == "difficult"


def test_vertical_displacement_title_case_maps_like_lowercase() -> None:
    lower = normalize_barrier(
        _point_feature(
            -77.03,
            38.905,
            {"GIS_ID": "GIS_bar_a", "ASSET_TYPE": "vertical displacement"},
        )
    )
    title = normalize_barrier(
        _point_feature(
            -77.04,
            38.906,
            {"GIS_ID": "GIS_bar_b", "ASSET_TYPE": "Vertical Displacement"},
        )
    )
    assert (
        lower is not None
        and title is not None
        and lower.condition_normalized == title.condition_normalized
    )


@pytest.mark.parametrize(
    ("label", "normalized"),
    [
        ("Type A : Old version (non-compliant)", "difficult"),
        ("Type B: 3-inch button (non-compliant)", "difficult"),
        ("Type C: Compliant version with Vibro-tactile and arrow", "present"),
        ("None", "absent"),
        (None, "n_a"),
    ],
)
def test_audible_signals_pushbutton_table(label: str | None, normalized: str) -> None:
    """Every audible-signal row is `kind="aid"` regardless of compliance.

    The category itself is a support feature; per-row *quality* (compliant,
    non-compliant, absent, etc.) is captured by `condition_normalized` instead.
    """
    props = {
        "GIS_ID": "APS_demo",
        "PUSHBUTTON_TYPE": label,
        "INTERSECTION_ID": None,
        "YEAR_INSPECTED": None,
    }
    row = normalize_audible_signal(_point_feature(-76.991, 38.924, props))
    assert (
        row is not None and row.condition_normalized == normalized and row.kind == "aid"
    )


def test_bus_stop_kind_for_noncompliant() -> None:
    props = {
        "GIS_ID": "bus_demo",
        "CONDITION": "Non-Compliant",
        "YEAR_INSPECTED": None,
    }
    row = normalize_bus_stop(_point_feature(-77.01, 38.91, props))
    assert row is not None and row.kind == "obstacle"


def test_driveway_inherits_curb_ramp_condition_table() -> None:
    props = {"GIS_ID": "drive_demo", "CONDITION": "Missing", "YEAR_INSPECTED": None}
    row = normalize_driveway(_point_feature(-77.02, 38.92, props))
    assert (
        row is not None
        and row.condition_normalized == "missing"
        and row.kind == "obstacle"
    )


def test_median_cut_through_uses_aid_when_good_or_fair() -> None:
    props = {"GIS_ID": "med_demo", "CONDITION": "Good", "YEAR_INSPECTED": None}
    row = normalize_median_cut_through(_point_feature(-77.045, 38.917, props))
    assert (
        row is not None and row.category == "median_cut_throughs" and row.kind == "aid"
    )


def test_geojson_collection_skips_non_feature_rows() -> None:
    raw = {
        "type": "FeatureCollection",
        "features": ["garbage-string", {}, {"type": "Feature"}],
    }
    feats, malformed = load_geojson_feature_collection(raw)
    assert len(feats) == 1 and malformed == 2


def test_feature_id_formatter() -> None:
    assert (
        feature_id("dc_ada_driveway", "ADA_DrivePt_123")
        == "dc_ada_driveway:ADA_DrivePt_123"
    )


def test_sidewalk_condition_excellent_maps_good_aid() -> None:
    """Excellent sidewalks return None — the ingest filter only keeps degraded."""
    props = {
        "ID": "sc-demo-1",
        "SCI": 11,
        "SCI_CATEGORY": "EXCELLENT",
        "SIDEWALK_LENGTH_FT": 200,
    }
    row = normalize_sidewalk_condition(_point_feature(-77.01, 38.905, props))
    assert row is None  # filtered out by INGEST_SIDEWALK_CONDITION


@pytest.mark.parametrize(
    ("scicat", "normalized", "kind"),
    [
        ("FAIR", "mild", "obstacle"),
        ("POOR", "difficult", "obstacle"),
        ("FAILED", "blocking", "obstacle"),
    ],
)
def test_sidewalk_condition_sci_category_table(
    scicat: str, normalized: str, kind: str
) -> None:
    """All degraded SCI_CATEGORY values are retained as obstacle rows."""
    props = {
        "ID": f"sc-{scicat}",
        "SCI": 1,
        "SCI_CATEGORY": scicat,
        "SIDEWALK_LENGTH_FT": None,
    }
    row = normalize_sidewalk_condition(_point_feature(-77.0, 38.9, props))
    assert row is not None
    assert row.condition_normalized == normalized
    assert row.kind == kind


def test_sidewalk_condition_na_is_filtered() -> None:
    """N/A (unknown) sidewalks are also filtered out."""
    props = {
        "ID": "sc-na",
        "SCI": None,
        "SCI_CATEGORY": "N/A",
        "SIDEWALK_LENGTH_FT": None,
    }
    row = normalize_sidewalk_condition(_point_feature(-77.0, 38.9, props))
    assert row is None


def test_sidewalk_condition_preserves_attributes() -> None:
    props = {
        "ID": "sc-attrs",
        "SCI": 9,
        "SCI_CATEGORY": "POOR",
        "SIDEWALK_LENGTH_FT": 420,
        "OWNERSHIP": "DDOT",
        "MAINTENANCEPRIORITY": "HIGH",
    }
    row = normalize_sidewalk_condition(_point_feature(-77.0, 38.9, props))
    assert row is not None
    assert row.attributes["SCI"] == 9
    assert row.attributes["SIDEWALK_LENGTH_FT"] == 420
    assert row.attributes["OWNERSHIP"] == "DDOT"
    assert row.attributes["MAINTENANCEPRIORITY"] == "HIGH"


def test_datasets_exclude_accessible_parking_zones_geojson() -> None:
    filenames = {spec.filename for spec in DATASETS}
    assert "Accessible_Parking_Zones.geojson" not in filenames
    assert len(DATASETS) == 7
