"""Unit tests for MAR → `dc_addresses` snapshot mapping (no DB, no network)."""

from __future__ import annotations

import json

from scout.data.mar_address_mapping import (
    dc_address_row_from_attributes,
    dc_address_row_from_snapshot_line,
    format_mar_id,
    normalize_dc_address_query_text,
    prefix_tsquery_from_tokens,
    snapshot_line_from_row,
)


def test_prefix_tsquery_from_tokens_joins_prefix_operators() -> None:
    assert prefix_tsquery_from_tokens(["4818", "ka"]) == "4818:* & ka:*"


def test_normalize_dc_address_query_text_strips_punctuation() -> None:
    assert (
        normalize_dc_address_query_text("4818 Kansas Ave., NW") == "4818 kansas ave nw"
    )


def test_format_mar_id_coerces_float_whole_numbers() -> None:
    assert format_mar_id(4818.0) == "4818"
    assert format_mar_id(" 12 ") == "12"


def test_dc_address_row_from_attributes_happy_path() -> None:
    row = dc_address_row_from_attributes(
        {
            "MAR_ID": 123.0,
            "ADDRESS": "1400 U STREET NW",
            "LATITUDE": 38.917,
            "LONGITUDE": -77.032,
        }
    )
    assert row == ("123", "1400 U STREET NW", "1400 u street nw", -77.032, 38.917)


def test_dc_address_row_skips_when_coords_invalid() -> None:
    assert (
        dc_address_row_from_attributes(
            {
                "MAR_ID": 1.0,
                "ADDRESS": "NOWHERE",
                "LATITUDE": 999.0,
                "LONGITUDE": -77.0,
            }
        )
        is None
    )


def test_snapshot_roundtrip_is_idempotent() -> None:
    row = dc_address_row_from_attributes(
        {
            "MAR_ID": 999.0,
            "ADDRESS": "6114 EASTERN AVENUE NE",
            "LATITUDE": 38.96421647,
            "LONGITUDE": -77.0008827,
        }
    )
    assert row is not None
    line = snapshot_line_from_row(row)
    raw = json.dumps(line)
    again = dc_address_row_from_snapshot_line(json.loads(raw))
    assert again == row
