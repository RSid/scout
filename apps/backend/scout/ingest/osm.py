"""Overpass-derived amenities for DC ingest."""

from __future__ import annotations

import json
import time
from typing import Any, Literal, cast

import httpx

from scout.ingest.dc import NormalizedRow, feature_id

OverpassAmenity = Literal["bench", "drinking_water"]

# south, west, north, east
DC_BBOX: tuple[float, float, float, float] = (38.79, -77.12, 38.99, -76.91)
OVERPASS_URL = "https://overpass-api.de/api/interpreter"
USER_AGENT = "scout-ingest/0.1 (+https://github.com/RSid/scout)"


def _check_date_year(tags: dict[str, object]) -> int | None:
    raw = tags.get("check_date")
    if isinstance(raw, str) and raw.strip():
        digits = "".join(ch for ch in raw[:16] if ch.isdigit())
        if len(digits) >= 4:
            y = int(digits[:4])
            return y if 1800 <= y <= 2100 else None
    return None


def _category_for_amenity(amenity: OverpassAmenity) -> tuple[str, str]:
    if amenity == "bench":
        return ("rest_spots", "osm_overpass_bench")
    return ("water_cooling", "osm_overpass_drinking_water")


def _overpass_body(
    amenity: OverpassAmenity, bbox: tuple[float, float, float, float]
) -> str:
    south, west, north, east = bbox
    amenity_lit = amenity.replace('"', '\\"')
    return (
        f"[out:json][timeout:60];\n"
        f'node["amenity"="{amenity_lit}"]({south},{west},{north},{east});\n'
        "out;"
    )


def _normalize_elements(
    elements: object,
    *,
    amenity: OverpassAmenity,
) -> list[NormalizedRow]:
    if not isinstance(elements, list):
        return []
    out: list[NormalizedRow] = []
    for raw in elements:
        if not isinstance(raw, dict):
            continue
        el = cast(dict[str, Any], raw)
        if el.get("type") != "node":
            continue
        try:
            node_id = int(el["id"])
        except (TypeError, ValueError):
            continue
        lat_any = el.get("lat")
        lon_any = el.get("lon")
        if not isinstance(lat_any, (int, float)) or not isinstance(
            lon_any, (int, float)
        ):
            continue
        tags_any = el.get("tags") or {}
        if isinstance(tags_any, dict):
            tags_dict = {str(k): v for k, v in tags_any.items()}
        else:
            tags_dict = {}
        cat, sd = _category_for_amenity(amenity)
        src = f"osm:node/{node_id}"
        out.append(
            NormalizedRow(
                id=feature_id(sd, src),
                category=cat,
                kind="aid",
                condition=None,
                condition_normalized="present",
                inspected_year=_check_date_year(tags_dict),
                source_dataset=sd,
                source_id=src,
                attributes={"tags": tags_dict},
                lon=float(lon_any),
                lat=float(lat_any),
            )
        )
    return out


def fetch_overpass_amenities(
    amenity: OverpassAmenity,
    *,
    client: httpx.Client,
    bbox: tuple[float, float, float, float] = DC_BBOX,
    overpass_url: str = OVERPASS_URL,
) -> list[NormalizedRow]:
    """Fetch benches or drinking fountains in the DC bbox (sync HTTP)."""

    ql = _overpass_body(amenity, bbox)
    backoff = [0.0, 0.5, 1.5]
    last_exc: Exception | None = None
    data: dict[str, object] | None = None

    for pause in backoff:
        if pause > 0:
            time.sleep(pause)
        try:
            resp = client.post(
                overpass_url,
                data={"data": ql},
                headers={
                    "User-Agent": USER_AGENT,
                },
                timeout=httpx.Timeout(60.0, connect=10.0),
            )
            if resp.status_code >= 500:
                raise httpx.HTTPStatusError(
                    "Overpass upstream error.", request=resp.request, response=resp
                )
            resp.raise_for_status()
            data = resp.json()
            break
        except (httpx.HTTPError, ValueError, json.JSONDecodeError) as exc:
            last_exc = exc
            continue
    else:
        msg = "Overpass request failed after retries."
        raise RuntimeError(msg) from last_exc

    assert data is not None
    elems = data.get("elements")
    if elems is None:
        msg = "Overpass JSON missing elements list."
        raise ValueError(msg)
    return _normalize_elements(elems, amenity=amenity)


def fetch_overpass_benches(*, client: httpx.Client) -> list[NormalizedRow]:
    return fetch_overpass_amenities("bench", client=client)


def fetch_overpass_drinking_water(*, client: httpx.Client) -> list[NormalizedRow]:
    return fetch_overpass_amenities("drinking_water", client=client)
