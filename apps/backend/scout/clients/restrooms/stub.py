"""Offline restrooms adapter for tests (deterministic, zero IO)."""

from __future__ import annotations

from scout.clients.restrooms.protocol import RestroomsProvider
from scout.clients.restrooms.types import Bbox, Restroom

# A small fixed DC catalog. Includes an HTML-laden comment (exercises the
# sanitisation path), an inaccessible row (exercises the defensive drop), and
# a far-away row (exercises bbox filtering).
_CATALOG: tuple[Restroom, ...] = (
    Restroom(
        api_id="1",
        name="Dupont Cafe",
        street="1500 Connecticut Ave NW",
        city="Washington",
        state="DC",
        accessible=True,
        unisex=True,
        changing_table=False,
        directions="Ask staff for the key.",
        comment="<b>Clean</b> and <script>alert('x')</script> spacious.",
        lat=38.9097,
        lng=-77.0434,
        updated_at="2024-06-15T12:00:00.000Z",
    ),
    Restroom(
        api_id="2",
        name="Union Station",
        street="50 Massachusetts Ave NE",
        city="Washington",
        state="DC",
        accessible=True,
        unisex=False,
        changing_table=True,
        directions=None,
        comment="Main concourse, east wing.",
        lat=38.8977,
        lng=-77.0064,
        updated_at="2023-01-02T00:00:00.000Z",
    ),
    Restroom(
        api_id="3",
        name="Stairs-only diner",
        street="Somewhere",
        city="Washington",
        state="DC",
        accessible=False,
        unisex=False,
        changing_table=False,
        directions=None,
        comment=None,
        lat=38.8800,
        lng=-77.0500,
        updated_at=None,
    ),
    Restroom(
        api_id="4",
        name="Out of region",
        street=None,
        city=None,
        state=None,
        accessible=True,
        unisex=False,
        changing_table=False,
        directions=None,
        comment=None,
        lat=39.5000,
        lng=-75.0000,
        updated_at="2022-05-05T00:00:00.000Z",
    ),
)


class StubRestroomsProvider(RestroomsProvider):
    async def list_in_bbox(self, bbox: Bbox) -> list[Restroom]:
        return [r for r in _CATALOG if bbox.contains(r.lng, r.lat)]
