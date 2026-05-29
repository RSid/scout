"""Tests for the Refuge Restrooms integration (M1-F13)."""

from __future__ import annotations

import httpx
import pytest
import respx
from starlette.testclient import TestClient

from scout.clients.restrooms.normalize import (
    restroom_to_feature,
    to_plain_text,
)
from scout.clients.restrooms.refuge import DC_BBOX, RefugeRestroomsProvider
from scout.clients.restrooms.types import Bbox, Restroom
from scout.config import Settings
from scout.errors import RestroomsUpstreamUnavailableError
from scout.main import app

_DC_BBOX_QS = "-77.12,38.79,-76.91,39.0"
_BY_LOCATION = "https://www.refugerestrooms.org/api/v1/restrooms/by_location"


# --- endpoint (stub provider) -------------------------------------------------


def test_restrooms_endpoint_returns_accessible_dc_features() -> None:
    with TestClient(app) as client:
        body = client.get("/api/restrooms", params={"bbox": _DC_BBOX_QS}).json()
    ids = {f["properties"]["id"] for f in body["features"]}
    assert ids == {"refugerestrooms:1", "refugerestrooms:2"}


def test_restrooms_endpoint_normalizes_kind_and_condition() -> None:
    with TestClient(app) as client:
        body = client.get("/api/restrooms", params={"bbox": _DC_BBOX_QS}).json()
    props = body["features"][0]["properties"]
    assert (props["category"], props["kind"], props["condition_normalized"]) == (
        "restrooms",
        "aid",
        "present",
    )


def test_restrooms_endpoint_strips_html_from_notes() -> None:
    # The stub's api_id "1" carries a <script> tag in its comment.
    with TestClient(app) as client:
        body = client.get("/api/restrooms", params={"bbox": _DC_BBOX_QS}).json()
    notes = next(
        f["properties"]["attributes"]["notes"]
        for f in body["features"]
        if f["properties"]["id"] == "refugerestrooms:1"
    )
    assert "<" not in notes and ">" not in notes


def test_restrooms_endpoint_rejects_non_numeric_bbox() -> None:
    with TestClient(app) as client:
        resp = client.get("/api/restrooms", params={"bbox": "a,b,c,d"})
    assert resp.json()["error"]["code"] == "INVALID_INPUT"


# --- normalisation (no IO) ----------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("<b>Hello</b> <i>world</i>", "Hello world"),
        ("&lt;script&gt;alert(1)&lt;/script&gt;ok", "alert(1)ok"),
        (None, ""),
        ("plain text", "plain text"),
    ],
)
def test_to_plain_text_never_emits_markup(raw: str | None, expected: str) -> None:
    assert to_plain_text(raw) == expected


def test_restroom_to_feature_maps_appendix_b8_fields() -> None:
    restroom = Restroom(
        api_id="42",
        name="Library",
        street="1 St NW",
        city="Washington",
        state="DC",
        accessible=True,
        unisex=True,
        changing_table=False,
        directions="Go left",
        comment="great",
        lat=38.9,
        lng=-77.0,
        updated_at="2021-07-08T10:00:00.000Z",
    )
    props = restroom_to_feature(restroom)["properties"]
    assert (
        props["id"],
        props["source_dataset"],
        props["source_id"],
        props["inspected_year"],
        props["attributes"]["notes"],
    ) == ("refugerestrooms:42", "refugerestrooms", "42", 2021, "Go left great")


# --- real adapter (respx) -----------------------------------------------------

# MOCK: a single in-DC Refuge record with HTML in its comment, plus an empty
# follow-up page so pagination terminates.
_VENDOR_PAGE = [
    {
        "id": 101,
        "name": "Cafe",
        "street": "1 St NW",
        "city": "Washington",
        "state": "DC",
        "accessible": True,
        "unisex": True,
        "changing_table": False,
        "directions": "Side door",
        "comment": "<b>nice</b><script>x()</script>",
        "latitude": 38.9,
        "longitude": -77.02,
        "updated_at": "2024-03-01T00:00:00.000Z",
    }
]


def _settings() -> Settings:
    return Settings()


@respx.mock
async def test_refuge_adapter_maps_vendor_records() -> None:
    respx.get(_BY_LOCATION).mock(
        side_effect=[
            httpx.Response(200, json=_VENDOR_PAGE),
            httpx.Response(200, json=[]),
        ]
    )
    async with httpx.AsyncClient() as client:
        provider = RefugeRestroomsProvider(settings=_settings(), client=client)
        restrooms = await provider.list_in_bbox(DC_BBOX)
    assert (restrooms[0].api_id, restrooms[0].accessible) == ("101", True)


@respx.mock
async def test_refuge_adapter_caches_dc_set() -> None:
    route = respx.get(_BY_LOCATION).mock(
        side_effect=[
            httpx.Response(200, json=_VENDOR_PAGE),
            httpx.Response(200, json=[]),
        ]
    )
    async with httpx.AsyncClient() as client:
        provider = RefugeRestroomsProvider(settings=_settings(), client=client)
        await provider.list_in_bbox(DC_BBOX)
        await provider.list_in_bbox(DC_BBOX)
    # The second call is served from cache: only the initial two page fetches.
    assert route.call_count == 2


@respx.mock
async def test_refuge_adapter_serves_stale_on_upstream_error() -> None:
    respx.get(_BY_LOCATION).mock(
        side_effect=[
            httpx.Response(200, json=_VENDOR_PAGE),
            httpx.Response(200, json=[]),
            httpx.Response(500),
        ]
    )
    async with httpx.AsyncClient() as client:
        provider = RefugeRestroomsProvider(settings=_settings(), client=client)
        primed = await provider.list_in_bbox(DC_BBOX)
        provider._deadline = 0.0  # force the cache to look stale
        served = await provider.list_in_bbox(DC_BBOX)
    assert served == primed


@respx.mock
async def test_refuge_adapter_raises_when_no_cache() -> None:
    respx.get(_BY_LOCATION).respond(500)
    async with httpx.AsyncClient() as client:
        provider = RefugeRestroomsProvider(settings=_settings(), client=client)
        with pytest.raises(RestroomsUpstreamUnavailableError):
            await provider.list_in_bbox(DC_BBOX)


def test_bbox_contains_is_edge_inclusive() -> None:
    assert Bbox(west=-1.0, south=-1.0, east=1.0, north=1.0).contains(1.0, -1.0)
