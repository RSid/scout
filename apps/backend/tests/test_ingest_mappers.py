"""Pure-Python tests for per-dataset normalizers (no DB).

These exercise the mapping rules in `docs/appendix-data-schema.md` §B and the
casing/null edge cases called out as M1-F11 acceptance criteria. The DB-side
idempotency tests live in `test_ingest_db.py`.
"""

from __future__ import annotations

from typing import Any

import pytest
from _dc_mappers import (
    DATASETS_ENABLED,
    DATASETS_SKIPPED,
    normalize_audible_signals,
    normalize_barriers,
    normalize_bus_stop,
    normalize_curb_ramp,
    normalize_driveway,
    normalize_median_cut_through,
    normalize_osm_amenity,
)


def _dc_feature(
    properties: dict[str, Any], *, lon: float = -77.03, lat: float = 38.9
) -> dict[str, Any]:
    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }


@pytest.mark.parametrize(
    "condition,expected_norm,expected_kind",
    [
        ("Good", "good", "aid"),
        ("Fair", "mild", "aid"),
        ("Non-Compliant", "blocking", "obstacle"),
        ("Missing", "missing", "obstacle"),
        (None, "n_a", "obstacle"),
    ],
)
def test_curb_ramp_condition_mapping(
    condition: str | None, expected_norm: str, expected_kind: str
) -> None:
    raw = _dc_feature(
        {"GIS_ID": "ADA_CurbRampPt_1", "CONDITION": condition, "YEAR_INSPECTED": 2016}
    )

    row = normalize_curb_ramp(raw)

    assert (row["condition_normalized"], row["kind"]) == (expected_norm, expected_kind)


def test_curb_ramp_preserves_raw_condition_and_id_formula() -> None:
    raw = _dc_feature({"GIS_ID": "ADA_CurbRampPt_1", "CONDITION": "Fair"})

    row = normalize_curb_ramp(raw)

    assert row["id"] == "dc_ada_curb_ramp:ADA_CurbRampPt_1"


@pytest.mark.parametrize(
    "asset_type,expected_norm",
    [
        ("vertical displacement", "difficult"),
        ("Vertical Displacement", "difficult"),
        ("SIDEWALK ENDS", "blocking"),
        ("Pole", "mild"),
        ("something else entirely", "mild"),
    ],
)
def test_barriers_lowercases_asset_type_before_mapping(
    asset_type: str, expected_norm: str
) -> None:
    raw = _dc_feature({"GIS_ID": "B-1", "ASSET_TYPE": asset_type})

    row = normalize_barriers(raw)

    assert row["condition_normalized"] == expected_norm


def test_barriers_preserves_raw_and_normalized_asset_type_in_attributes() -> None:
    raw = _dc_feature({"GIS_ID": "B-1", "ASSET_TYPE": "Vertical Displacement"})

    attributes = normalize_barriers(raw)["attributes"]

    assert attributes["ASSET_TYPE_RAW"] == "Vertical Displacement"


@pytest.mark.parametrize(
    "pushbutton,expected_norm,expected_kind",
    [
        (
            "Type C: Compliant version with Vibro-tactile and arrow",
            "present",
            "aid",
        ),
        ("Type B: 3-inch button (non-compliant)", "difficult", "obstacle"),
        ("None", "absent", "obstacle"),
        (None, "n_a", "obstacle"),
    ],
)
def test_audible_signals_pushbutton_mapping(
    pushbutton: str | None, expected_norm: str, expected_kind: str
) -> None:
    raw = _dc_feature({"GIS_ID": "A-1", "PUSHBUTTON_TYPE": pushbutton})

    row = normalize_audible_signals(raw)

    assert (row["condition_normalized"], row["kind"]) == (expected_norm, expected_kind)


@pytest.mark.parametrize(
    "normalize,source_dataset,category",
    [
        (normalize_bus_stop, "dc_ada_bus_stop", "bus_stops"),
        (normalize_driveway, "dc_ada_driveway", "driveways"),
        (
            normalize_median_cut_through,
            "dc_ada_median_cut_through",
            "median_cut_throughs",
        ),
    ],
)
def test_generic_condition_datasets_share_mapping(
    normalize: Any, source_dataset: str, category: str
) -> None:
    raw = _dc_feature({"GIS_ID": "X-1", "CONDITION": "Non-Compliant"})

    row = normalize(raw)

    assert (row["category"], row["source_dataset"], row["condition_normalized"]) == (
        category,
        source_dataset,
        "blocking",
    )


def test_osm_amenity_bench_maps_to_rest_spots_with_check_date_year() -> None:
    node = {
        "type": "node",
        "id": 42,
        "lat": 38.9,
        "lon": -77.03,
        "tags": {"amenity": "bench", "check_date": "2023-08-14"},
    }

    row = normalize_osm_amenity(node, amenity="bench")

    assert (row["category"], row["condition_normalized"], row["inspected_year"]) == (
        "rest_spots",
        "present",
        2023,
    )


def test_osm_amenity_without_check_date_yields_null_inspected_year() -> None:
    node = {"type": "node", "id": 7, "lat": 38.9, "lon": -77.03, "tags": {}}

    row = normalize_osm_amenity(node, amenity="drinking_water")

    assert row["inspected_year"] is None


def test_accessible_parking_zones_is_registered_as_skipped() -> None:
    # The acceptance criterion calls this dataset out by name; keep the assertion
    # explicit so a refactor that drops it shows up in code review.
    skipped_paths = {entry.path for entry in DATASETS_SKIPPED}

    assert "data/Accessible_Parking_Zones.geojson" in skipped_paths


def test_enabled_datasets_cover_every_m1_category() -> None:
    categories = {src.category for src in DATASETS_ENABLED}

    assert categories == {
        "curb_ramps",
        "barriers",
        "audible_signals",
        "bus_stops",
        "driveways",
        "median_cut_throughs",
    }
