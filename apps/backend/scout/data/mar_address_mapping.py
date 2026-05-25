"""Pure helpers for MAR / DC address ingestion (scripts + unit tests).

The ArcGIS MAR layer fields are documented on the OCTO FeatureServer
metadata. Mapping stops at plain Python types so tests never touch HTTP.
"""

from __future__ import annotations

import math
import re
from collections.abc import Iterable, Mapping
from typing import Any


def normalize_dc_address_query_text(text: str) -> str:
    """Collapse whitespace and strip punctuation for FTS / matching."""

    lowered = text.lower().strip()
    alphanumeric = re.sub(r"[^a-z0-9\s]+", " ", lowered)
    return " ".join(alphanumeric.split())


def format_mar_id(raw: object) -> str | None:
    """Normalize MAR identifiers (often JSON numbers) into stable strings."""

    if raw is None or isinstance(raw, bool):
        return None
    if isinstance(raw, int):
        return str(raw)
    if isinstance(raw, float):
        if math.isnan(raw):
            return None
        rounded = round(raw)
        if math.isclose(raw, rounded, rel_tol=0, abs_tol=1e-9):
            return str(int(rounded))
        return str(raw)
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def dc_address_row_from_attributes(
    attrs: Mapping[str, Any],
) -> tuple[str, str, str, float, float] | None:
    """Map an ArcGIS `attributes` dict to (id, label_full, label_norm, lon, lat)."""

    mar_id = format_mar_id(attrs.get("MAR_ID"))
    if mar_id is None:
        return None
    address = attrs.get("ADDRESS")
    if not isinstance(address, str) or not address.strip():
        return None
    label_full = address.strip()
    lat_raw = attrs.get("LATITUDE")
    lon_raw = attrs.get("LONGITUDE")
    if lat_raw is None or lon_raw is None:
        return None
    if not isinstance(lat_raw, (int, float, str)) or not isinstance(
        lon_raw, (int, float, str)
    ):
        return None
    try:
        lat = float(lat_raw)
        lon = float(lon_raw)
    except (TypeError, ValueError):
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None
    normalized = normalize_dc_address_query_text(label_full)
    if not normalized:
        return None
    return (mar_id, label_full, normalized, lon, lat)


def snapshot_line_from_row(
    row: tuple[str, str, str, float, float],
) -> dict[str, Any]:
    """JSONL-compatible dict (mar_id mirrors `id`)."""

    mar_id, label_full, _, lon, lat = row
    return {
        "mar_id": mar_id,
        "label_full": label_full,
        "lon": lon,
        "lat": lat,
    }


def dc_address_row_from_snapshot_line(
    payload: Mapping[str, Any],
) -> tuple[str, str, str, float, float] | None:
    """Validate a snapshot JSON object and rebuild the searchable row."""

    mar_id = format_mar_id(payload.get("mar_id"))
    if mar_id is None:
        return None
    label = payload.get("label_full")
    if not isinstance(label, str) or not label.strip():
        return None
    label_full = label.strip()
    try:
        lon = float(payload["lon"])
        lat = float(payload["lat"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
        return None
    normalized = normalize_dc_address_query_text(label_full)
    if not normalized:
        return None
    return (mar_id, label_full, normalized, lon, lat)


def prefix_tsquery_from_tokens(tokens: Iterable[str]) -> str:
    """Join normalized tokens into a Postgres `simple` FTS prefix query."""

    parts: list[str] = []
    for raw in tokens:
        tok = "".join(ch for ch in raw if ch.isalnum())
        if len(tok) < 1:
            continue
        # Only `[a-z0-9]` reaches here; defensive escape for tsquery parsers.
        safe = tok.replace("\\", r"\\\\").replace("'", "''")
        parts.append(f"{safe}:*")
    return " & ".join(parts)
