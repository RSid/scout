"""Overpass ingestion translation exercised against stubbed HTTPS."""

from __future__ import annotations

import httpx
import respx  # MOCK: stub Overpass HTTPS to keep ingestion offline.

from scout.ingest.osm import fetch_overpass_amenities, fetch_overpass_drinking_water


@respx.mock
def test_overpass_benches_map_to_rest_spots() -> None:
    respx.post("https://overpass-api.de/api/interpreter").respond(
        200,
        json={
            "elements": [
                {
                    "type": "node",
                    "id": 900_001,
                    "lat": 38.919,
                    "lon": -77.041,
                    "tags": {"amenity": "bench", "check_date": "2022-06-07"},
                }
            ]
        },
    )
    rows = fetch_overpass_amenities(
        "bench",
        client=httpx.Client(),
        overpass_url="https://overpass-api.de/api/interpreter",
    )

    row = rows[0]
    assert (
        row.category == "rest_spots"
        and row.source_dataset == "osm_overpass_bench"
        and row.inspected_year == 2022
    )


@respx.mock
def test_overpass_drinking_water_maps_to_water_cooling() -> None:
    respx.post("https://overpass-api.de/api/interpreter").respond(
        200,
        json={
            "elements": [
                {
                    "type": "node",
                    "id": 900_055,
                    "lat": 38.901,
                    "lon": -77.028,
                    "tags": {"amenity": "drinking_water"},
                }
            ]
        },
    )

    rows = fetch_overpass_drinking_water(client=httpx.Client())
    row = rows[0]
    combined = (
        len(rows) == 1
        and row.category == "water_cooling"
        and row.source_dataset == "osm_overpass_drinking_water"
    )
    assert combined
