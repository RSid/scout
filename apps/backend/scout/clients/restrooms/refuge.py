"""Refuge restrooms adapter."""

from __future__ import annotations

from typing import Any

import httpx

from scout.clients.restrooms.protocol import RestroomsProvider
from scout.config import Settings
from scout.errors import UpstreamUnavailableError


class RefugeRestroomsProvider(RestroomsProvider):
    def __init__(self, *, settings: Settings, client: httpx.AsyncClient) -> None:
        self._settings = settings
        self._client = client

    async def restrooms_in_bbox(
        self,
        west: float,
        south: float,
        east: float,
        north: float,
    ) -> dict[str, Any]:
        path = "/restrooms/by_location"
        params: dict[str, str | float | bool | None] = {
            "south": south,
            "west": west,
            "north": north,
            "east": east,
            "ada": "true",
        }
        try:
            resp = await self._client.get(
                f"{self._settings.refuge_base_url.rstrip('/')}{path}",
                params=params,
                timeout=10.0,
            )
        except httpx.HTTPError as exc:
            raise UpstreamUnavailableError(
                message="Refuge restrooms API unreachable."
            ) from exc
        if resp.status_code >= 400:
            raise UpstreamUnavailableError()
        data = resp.json()
        normalized = RefugeRestroomsProvider._normalize(data)
        return normalized

    @staticmethod
    def _normalize(refuge_payload: object) -> dict[str, Any]:
        records: list[dict[str, Any]]
        if isinstance(refuge_payload, list):
            records = [dict(r) for r in refuge_payload]
        elif isinstance(refuge_payload, dict) and isinstance(
            refuge_payload.get("data"), list
        ):
            records = list(refuge_payload.get("data", []))
        else:
            records = []

        features: list[dict[str, Any]] = []
        for entry in records:
            lat_raw = entry.get("latitude") or entry.get("lat")
            lon_raw = entry.get("longitude") or entry.get("lng")
            if lat_raw is None or lon_raw is None:
                continue
            try:
                lon = float(str(lon_raw))
                lat = float(str(lat_raw))
            except (TypeError, ValueError):
                continue
            feature_id = f"refugerestrooms:{entry.get('id', f'{lon:.5f}-{lat:.5f}')}"
            inspected_year_raw = entry.get("updated_at")
            inspected_year: int | None = None
            if isinstance(inspected_year_raw, str) and inspected_year_raw[:4].isdigit():
                inspected_year = int(inspected_year_raw[:4])

            attrs = {}
            plain_comment = entry.get("comment")
            attrs["comments"] = str(plain_comment) if plain_comment is not None else ""

            geom = {"type": "Point", "coordinates": [lon, lat]}
            properties = {
                "id": feature_id,
                "category": "restrooms",
                "kind": "aid",
                "condition": str(entry.get("name", "")) if entry.get("name") else None,
                "condition_normalized": "good",
                "inspected_year": inspected_year,
                "source_dataset": "refugerestrooms",
                "source_id": str(entry.get("id", f"{lon:.5f}-{lat:.5f}")),
                "attributes": attrs,
            }
            features.append(
                {"type": "Feature", "geometry": geom, "properties": properties}
            )
        return {"type": "FeatureCollection", "features": features}
