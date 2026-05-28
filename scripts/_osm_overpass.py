"""Tiny OSM Overpass client + on-disk cache for the M1 ingestion (appendix §B.9).

Be a good Overpass citizen: declared timeout, single retry with back-off, a
descriptive User-Agent, and a local cache so re-runs do not hammer the API.
The script never logs raw response bodies — only counts (root AGENTS.md
"Security and privacy posture", `scripts/AGENTS.md` "Logging").
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Iterator, Mapping
from pathlib import Path
from typing import Any, Literal

import httpx

OsmAmenity = Literal["bench", "drinking_water"]

OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter"
USER_AGENT = "scout/0.1 (+https://github.com/RSid/scout)"
REQUEST_TIMEOUT_SECONDS = 60.0
DC_BBOX_S_W_N_E: tuple[float, float, float, float] = (38.79, -77.12, 39.00, -76.91)

_log = logging.getLogger("scout.ingest.overpass")


def _build_query(amenity: OsmAmenity, bbox: tuple[float, float, float, float]) -> str:
    south, west, north, east = bbox
    return (
        f"[out:json][timeout:{int(REQUEST_TIMEOUT_SECONDS)}];"
        f"node[amenity={amenity}]({south},{west},{north},{east});"
        "out;"
    )


def _cache_path(cache_dir: Path, amenity: OsmAmenity) -> Path:
    return cache_dir / f"osm_{amenity}.json"


def fetch_amenity(
    amenity: OsmAmenity,
    *,
    cache_dir: Path,
    bbox: tuple[float, float, float, float] = DC_BBOX_S_W_N_E,
    client_factory: type[httpx.Client] = httpx.Client,
    refresh: bool = False,
) -> list[Mapping[str, Any]]:
    """Return raw Overpass node elements for `amenity`, hitting the on-disk cache first.

    `client_factory` is the seam tests use to drop in a `respx`-routed client.
    """

    cache_dir.mkdir(parents=True, exist_ok=True)
    cached = _cache_path(cache_dir, amenity)
    if cached.exists() and not refresh:
        _log.info(
            "overpass cache hit amenity=%s path=%s",
            amenity,
            cached,
        )
        payload = json.loads(cached.read_text(encoding="utf-8"))
        return _elements(payload)

    query = _build_query(amenity, bbox)
    payload = _post_with_one_retry(query, client_factory=client_factory)
    cached.write_text(json.dumps(payload), encoding="utf-8")
    elements = _elements(payload)
    _log.info(
        "overpass fetched amenity=%s elements=%d cached_to=%s",
        amenity,
        len(elements),
        cached,
    )
    return elements


def _post_with_one_retry(
    query: str, *, client_factory: type[httpx.Client]
) -> Mapping[str, Any]:
    attempts = 0
    last_error: Exception | None = None
    backoff_seconds = 2.0
    while attempts < 2:
        attempts += 1
        try:
            with client_factory(
                headers={"User-Agent": USER_AGENT},
                timeout=REQUEST_TIMEOUT_SECONDS,
            ) as client:
                response = client.post(OVERPASS_ENDPOINT, data={"data": query})
                response.raise_for_status()
                return _as_payload(response.json())
        except (httpx.HTTPError, ValueError) as exc:
            last_error = exc
            _log.warning(
                "overpass attempt failed attempt=%d error_type=%s",
                attempts,
                type(exc).__name__,
            )
            if attempts >= 2:
                break
            time.sleep(backoff_seconds)
            backoff_seconds *= 2
    raise RuntimeError(
        f"Overpass request failed after {attempts} attempts"
    ) from last_error


def _as_payload(value: Any) -> Mapping[str, Any]:
    if not isinstance(value, Mapping):
        raise ValueError("Overpass response was not a JSON object")
    return value


def _elements(payload: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    elements = payload.get("elements", [])
    if not isinstance(elements, list):
        raise ValueError("Overpass payload.elements was not a list")
    return [el for el in _iter_nodes(elements)]


def _iter_nodes(elements: list[Any]) -> Iterator[Mapping[str, Any]]:
    for el in elements:
        if isinstance(el, Mapping) and el.get("type") == "node":
            yield el
