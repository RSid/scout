"""Pure helpers for DC Street Centerline ingestion (scripts + unit tests).

The DDOT Street Centerline (SubBlock) layer publishes each roadway segment with
a full display name in ``ROUTENAME`` (e.g. ``"14TH ST NW"``) and a stable
``SUBBLOCKKEY`` per segment. Mapping stops at plain Python types so tests never
touch HTTP or PostGIS. See ``DEC-027`` and ``docs/appendix-data-schema.md`` §B.12.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

# DC addresses carry a quadrant suffix that must stay upper-cased ("NW", not
# "Nw") when we title-case the rest of the label.
_QUADRANTS = frozenset({"NW", "NE", "SW", "SE"})

# DDOT `ROADTYPE` coded value for a real street. Only streets carry usable
# names; alleys/driveways/ramps/trails (other codes) get synthetic ROUTENAMEs
# like "Alley-47046842", which are useless as a "on {street}" label (DEC-027).
_STREET_ROADTYPE = "1"

_Coordinate = tuple[float, float]
StreetSegmentRow = tuple[str, str, list[_Coordinate]]


def normalize_street_name(raw: object) -> str | None:
    """Title-case a raw ``ROUTENAME`` while preserving ordinals and quadrants.

    ``"14TH ST NW"`` -> ``"14th St NW"``; ``"MASSACHUSETTS AVE NW"`` ->
    ``"Massachusetts Ave NW"``. Returns ``None`` when there is nothing usable.
    """

    if not isinstance(raw, str):
        return None
    tokens = raw.split()
    if not tokens:
        return None
    out: list[str] = []
    for token in tokens:
        upper = token.upper()
        if upper in _QUADRANTS:
            out.append(upper)
        elif token[0].isdigit():
            # Ordinals like "14TH" -> "14th"; plain title-casing yields "14Th".
            out.append(token.lower())
        else:
            out.append(token.capitalize())
    return " ".join(out)


def _coordinates_from_linestring(
    geometry: Mapping[str, Any],
) -> list[_Coordinate] | None:
    """Extract lon/lat pairs from a GeoJSON LineString geometry."""

    if geometry.get("type") != "LineString":
        return None
    coords_raw = geometry.get("coordinates")
    if not isinstance(coords_raw, Sequence) or len(coords_raw) < 2:
        return None
    coords: list[_Coordinate] = []
    for pair in coords_raw:
        if not isinstance(pair, Sequence) or len(pair) < 2:
            return None
        lon_raw, lat_raw = pair[0], pair[1]
        if not isinstance(lon_raw, (int, float)) or not isinstance(
            lat_raw, (int, float)
        ):
            return None
        lon, lat = float(lon_raw), float(lat_raw)
        if not (-180.0 <= lon <= 180.0 and -90.0 <= lat <= 90.0):
            return None
        coords.append((lon, lat))
    return coords


def street_segment_row_from_geojson(
    feature: Mapping[str, Any],
) -> StreetSegmentRow | None:
    """Map one ArcGIS GeoJSON feature to ``(source_id, name, coordinates)``.

    Segments without a resolvable name (alleys, ramps) or a valid LineString
    are skipped by returning ``None``.
    """

    props_raw = feature.get("properties")
    props = props_raw if isinstance(props_raw, Mapping) else {}
    if str(props.get("ROADTYPE")) != _STREET_ROADTYPE:
        return None
    source_id = _source_id(props)
    if source_id is None:
        return None
    name = normalize_street_name(props.get("ROUTENAME"))
    if name is None:
        return None
    geometry_raw = feature.get("geometry")
    if not isinstance(geometry_raw, Mapping):
        return None
    coords = _coordinates_from_linestring(geometry_raw)
    if coords is None:
        return None
    return (source_id, name, coords)


def _source_id(props: Mapping[str, Any]) -> str | None:
    raw = props.get("SUBBLOCKKEY")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    return None


def snapshot_line_from_street_segment_row(row: StreetSegmentRow) -> dict[str, Any]:
    """JSONL-compatible dict for one segment (coordinates preserved verbatim)."""

    source_id, name, coordinates = row
    return {
        "source_id": source_id,
        "name": name,
        "coordinates": [[lon, lat] for lon, lat in coordinates],
    }


def street_segment_row_from_snapshot_line(
    payload: Mapping[str, Any],
) -> StreetSegmentRow | None:
    """Validate a snapshot JSON object and rebuild the segment row."""

    source_id = payload.get("source_id")
    if not isinstance(source_id, str) or not source_id.strip():
        return None
    name = payload.get("name")
    if not isinstance(name, str) or not name.strip():
        return None
    coords = _coordinates_from_linestring(
        {"type": "LineString", "coordinates": payload.get("coordinates")}
    )
    if coords is None:
        return None
    return (source_id.strip(), name.strip(), coords)


def linestring_wkt_from_coordinates(coordinates: Sequence[_Coordinate]) -> str:
    """Build a ``LINESTRING(...)`` WKT body from lon/lat pairs."""

    pairs = ", ".join(f"{float(lon)} {float(lat)}" for lon, lat in coordinates)
    return f"LINESTRING({pairs})"
