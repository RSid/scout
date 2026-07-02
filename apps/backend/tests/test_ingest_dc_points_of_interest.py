"""Unit tests for MAR alias → `dc_points_of_interest` mapping (no DB, no network)."""

from __future__ import annotations

import json

from scout.data.mar_address_mapping import (
    poi_label_from_name_and_address,
    poi_object_id_and_mar_id_from_snapshot_line,
    poi_row_from_attributes_and_address,
    poi_row_from_snapshot_and_address,
    snapshot_line_from_poi_row,
)


def test_poi_label_from_name_and_address_combines_name_and_street_address() -> None:
    assert (
        poi_label_from_name_and_address(
            "WORLD WAR II MEMORIAL", "1750 INDEPENDENCE AVE SW"
        )
        == "WORLD WAR II MEMORIAL, 1750 INDEPENDENCE AVE SW"
    )


def test_poi_row_from_attributes_and_address_happy_path() -> None:
    row = poi_row_from_attributes_and_address(
        {
            "NAME": "NATIONAL BUILDING MUSEUM",
            "STATUS": "ACTIVE",
            "MAR_ID": 285727.0,
            "OBJECTID": 9001,
        },
        address_label_full="401 F ST NW",
        lon=-77.0157,
        lat=38.8983,
    )
    assert row == (
        "poi:9001",
        "285727",
        "NATIONAL BUILDING MUSEUM",
        "NATIONAL BUILDING MUSEUM, 401 F ST NW",
        "national building museum 401 f st nw",
        -77.0157,
        38.8983,
    )


def test_poi_row_skips_non_active_status() -> None:
    assert (
        poi_row_from_attributes_and_address(
            {
                "NAME": "RETIRED PLACE",
                "STATUS": "RETIRED",
                "MAR_ID": 1.0,
                "OBJECTID": 1,
            },
            address_label_full="1 ANYWHERE ST",
            lon=-77.0,
            lat=38.9,
        )
        is None
    )


def test_poi_row_skips_blank_name() -> None:
    assert (
        poi_row_from_attributes_and_address(
            {"NAME": "  ", "STATUS": "ACTIVE", "MAR_ID": 1.0, "OBJECTID": 1},
            address_label_full="1 ANYWHERE ST",
            lon=-77.0,
            lat=38.9,
        )
        is None
    )


def test_poi_row_skips_missing_object_id() -> None:
    assert (
        poi_row_from_attributes_and_address(
            {"NAME": "SOMEWHERE", "STATUS": "ACTIVE", "MAR_ID": 1.0},
            address_label_full="1 ANYWHERE ST",
            lon=-77.0,
            lat=38.9,
        )
        is None
    )


def test_poi_row_skips_out_of_range_coords() -> None:
    assert (
        poi_row_from_attributes_and_address(
            {"NAME": "NOWHERE", "STATUS": "ACTIVE", "MAR_ID": 1.0, "OBJECTID": 1},
            address_label_full="1 ANYWHERE ST",
            lon=999.0,
            lat=38.9,
        )
        is None
    )


def test_snapshot_line_from_poi_row_omits_coordinates() -> None:
    row = poi_row_from_attributes_and_address(
        {
            "NAME": "NATIONAL BUILDING MUSEUM",
            "STATUS": "ACTIVE",
            "MAR_ID": 285727.0,
            "OBJECTID": 9001,
        },
        address_label_full="401 F ST NW",
        lon=-77.0157,
        lat=38.8983,
    )
    assert row is not None
    snapshot = snapshot_line_from_poi_row(row)
    assert snapshot == {
        "object_id": "9001",
        "mar_id": "285727",
        "name": "NATIONAL BUILDING MUSEUM",
    }
    assert "lon" not in snapshot
    assert "lat" not in snapshot


def test_poi_snapshot_roundtrip_and_rejoin_is_idempotent() -> None:
    row = poi_row_from_attributes_and_address(
        {
            "NAME": "NATIONAL BUILDING MUSEUM",
            "STATUS": "ACTIVE",
            "MAR_ID": 285727.0,
            "OBJECTID": 9001,
        },
        address_label_full="401 F ST NW",
        lon=-77.0157,
        lat=38.8983,
    )
    assert row is not None
    snapshot = snapshot_line_from_poi_row(row)
    raw = json.dumps(snapshot)
    parsed = poi_object_id_and_mar_id_from_snapshot_line(json.loads(raw))
    assert parsed == ("9001", "285727", "NATIONAL BUILDING MUSEUM")

    object_id, mar_id, name = parsed
    rejoined = poi_row_from_snapshot_and_address(
        object_id,
        mar_id,
        name,
        address_label_full="401 F ST NW",
        lon=-77.0157,
        lat=38.8983,
    )
    assert rejoined == row


def test_poi_object_id_and_mar_id_from_snapshot_line_rejects_missing_name() -> None:
    assert (
        poi_object_id_and_mar_id_from_snapshot_line(
            {"object_id": "9001", "mar_id": "285727"}
        )
        is None
    )
