"""Normalise Refuge ``Restroom`` objects into the Scout ``Feature`` shape.

Sanitisation lives here so every consumer (``GET /api/restrooms`` and the
merged ``POST /api/route-features`` result) inherits identical, injection-safe
output. Free-text fields are reduced to plain text: no HTML survives
(M1-F13.S5, NF-A11Y-08).
"""

from __future__ import annotations

import html
from html.parser import HTMLParser
from typing import Any

from scout.clients.restrooms.types import Restroom


class _TextExtractor(HTMLParser):
    """Collect only the text nodes of an HTML fragment, dropping all tags."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self._chunks: list[str] = []

    def handle_data(self, data: str) -> None:
        self._chunks.append(data)

    def text(self) -> str:
        return "".join(self._chunks)


def to_plain_text(raw: str | None) -> str:
    """Strip every tag and entity, leaving collapsed plain text.

    Entities are decoded first so an encoded ``&lt;script&gt;`` becomes a real
    tag that the parser then drops; a final angle-bracket scrub guarantees the
    result can never carry ``<`` or ``>`` into a response or the DOM.
    """

    if not raw:
        return ""
    decoded = html.unescape(raw)
    extractor = _TextExtractor()
    extractor.feed(decoded)
    extractor.close()
    text = extractor.text().replace("<", "").replace(">", "")
    return " ".join(text.split())


def _year_of(updated_at: str | None) -> int | None:
    if updated_at and updated_at[:4].isdigit():
        return int(updated_at[:4])
    return None


def restroom_to_feature(restroom: Restroom) -> dict[str, Any]:
    """Map one ``Restroom`` to the normalized ``Feature`` (appendix B.8)."""

    notes = " ".join(
        part
        for part in (
            to_plain_text(restroom.directions),
            to_plain_text(restroom.comment),
        )
        if part
    )
    address = ", ".join(
        part for part in (restroom.street, restroom.city, restroom.state) if part
    )
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [restroom.lng, restroom.lat]},
        "properties": {
            "id": f"refugerestrooms:{restroom.api_id}",
            "category": "restrooms",
            "kind": "aid",
            "condition": None,
            "condition_normalized": "present",
            "inspected_year": _year_of(restroom.updated_at),
            "source_dataset": "refugerestrooms",
            "source_id": restroom.api_id,
            "attributes": {
                "label": restroom.name,
                "address": address or None,
                "notes": notes,
                "unisex": restroom.unisex,
                "changing_table": restroom.changing_table,
            },
        },
    }


def restrooms_to_features(restrooms: list[Restroom]) -> list[dict[str, Any]]:
    """Normalize a list, dropping inaccessible rows (defense in depth)."""

    return [restroom_to_feature(r) for r in restrooms if r.accessible]
