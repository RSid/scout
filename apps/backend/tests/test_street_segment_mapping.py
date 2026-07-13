"""Unit tests for the pure DC street-centerline mapping helpers (DEC-027)."""

from __future__ import annotations

import pytest

from scout.data.street_segment_mapping import (
    linestring_wkt_from_coordinates,
    normalize_street_name,
    snapshot_line_from_street_segment_row,
    street_segment_row_from_geojson,
    street_segment_row_from_snapshot_line,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("14TH ST NW", "14th St NW"),
        ("MASSACHUSETTS AVE NW", "Massachusetts Ave NW"),
        ("M ST SE", "M St SE"),
        ("MARTIN LUTHER KING JR AVE SE", "Martin Luther King Jr Ave SE"),
    ],
)
def test_normalize_street_name_titlecases_and_preserves_quadrant(
    raw: str, expected: str
) -> None:
    assert normalize_street_name(raw) == expected


@pytest.mark.parametrize("raw", ["", "   ", None, 42])
def test_normalize_street_name_returns_none_for_unusable_input(raw: object) -> None:
    assert normalize_street_name(raw) is None


def _geojson_feature(props: dict[str, object]) -> dict[str, object]:
    return {
        "type": "Feature",
        "properties": {"ROADTYPE": "1", **props},
        "geometry": {
            "type": "LineString",
            "coordinates": [[-77.032, 38.907], [-77.031, 38.908]],
        },
    }


def test_street_segment_row_from_geojson_maps_id_name_and_coordinates() -> None:
    row = street_segment_row_from_geojson(
        _geojson_feature({"SUBBLOCKKEY": "abc123", "ROUTENAME": "14TH ST NW"})
    )
    assert row == ("abc123", "14th St NW", [(-77.032, 38.907), (-77.031, 38.908)])


def test_street_segment_row_from_geojson_skips_nameless_segment() -> None:
    row = street_segment_row_from_geojson(
        _geojson_feature({"SUBBLOCKKEY": "abc123", "ROUTENAME": ""})
    )
    assert row is None


def test_street_segment_row_from_geojson_skips_non_street_roadtype() -> None:
    # ROADTYPE 5 (driveway) carries a synthetic "Driveway-..." ROUTENAME that
    # must never become an "on {street}" label (DEC-027).
    row = street_segment_row_from_geojson(
        {
            "type": "Feature",
            "properties": {
                "SUBBLOCKKEY": "abc123",
                "ROUTENAME": "Driveway-58021902",
                "ROADTYPE": "5",
            },
            "geometry": {
                "type": "LineString",
                "coordinates": [[-77.032, 38.907], [-77.031, 38.908]],
            },
        }
    )
    assert row is None


def test_snapshot_roundtrip_preserves_the_row() -> None:
    row = ("abc123", "14th St NW", [(-77.032, 38.907), (-77.031, 38.908)])
    line = snapshot_line_from_street_segment_row(row)
    assert street_segment_row_from_snapshot_line(line) == row


def test_linestring_wkt_from_coordinates_shape() -> None:
    wkt = linestring_wkt_from_coordinates([(-77.032, 38.907), (-77.031, 38.908)])
    assert wkt == "LINESTRING(-77.032 38.907, -77.031 38.908)"
