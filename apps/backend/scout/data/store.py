"""PostGIS query helpers."""

from __future__ import annotations

import time
from collections.abc import Sequence
from typing import Any

from geoalchemy2 import Geometry
from geoalchemy2 import functions as gf
from geoalchemy2.functions import ST_DWithin, ST_LineLocatePoint, ST_SetSRID
from geoalchemy2.shape import to_shape
from sqlalchemy import asc, desc, func, literal, select, text
from sqlalchemy import cast as sa_cast
from sqlalchemy.ext.asyncio import AsyncSession

from scout.data.mar_address_mapping import (
    normalize_dc_address_query_text,
    prefix_tsquery_from_tokens,
)
from scout.data.models import DcAddress, Feature


def _linestring_geography_wkt(coordinates: Sequence[Sequence[float]]) -> str:
    pairs = ",".join(f"{float(lon)} {float(lat)}" for lon, lat in coordinates)
    return f"LINESTRING({pairs})"


async def corridor_features_geojson(
    session: AsyncSession,
    *,
    coordinates: Sequence[Sequence[float]],
    categories: Sequence[str],
    buffer_meters: float,
    limit: int = 500,
) -> tuple[list[dict[str, Any]], float, bool]:
    """Buffered corridor intersection + along-route ordering."""

    started = time.perf_counter()
    ls_wkt = _linestring_geography_wkt(coordinates)
    line_geography = gf.ST_GeographyFromText(literal(f"SRID=4326;{ls_wkt}"))
    route_geom = ST_SetSRID(gf.ST_GeomFromText(literal(ls_wkt)), literal(4326))
    point_geom = sa_cast(
        Feature.geom, Geometry(srid=4326, spatial_index=False, dimension=2)
    )
    along_route = ST_LineLocatePoint(route_geom, point_geom).label("along_route")

    stmt = (
        select(Feature, along_route)
        .where(Feature.category.in_(tuple(categories)))
        .where(ST_DWithin(Feature.geom, line_geography, literal(buffer_meters)))
        .order_by(along_route.asc())
        .limit(limit + 1)
    )
    rows = (await session.execute(stmt)).all()

    truncated = len(rows) > limit
    if truncated:
        rows = rows[:limit]

    feats: list[dict[str, Any]] = []
    for row in rows:
        feature_row: Feature = row[0]
        geom_shape = to_shape(feature_row.geom)
        coords = [float(geom_shape.x), float(geom_shape.y)]
        props = {
            "id": feature_row.id,
            "category": feature_row.category,
            "kind": feature_row.kind,
            "condition": feature_row.condition,
            "condition_normalized": feature_row.condition_normalized,
            "inspected_year": feature_row.inspected_year,
            "source_dataset": feature_row.source_dataset,
            "source_id": feature_row.source_id,
            "attributes": dict(feature_row.attributes),
        }
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coords},
                "properties": {k: v for k, v in props.items() if k != "geometry"},
            }
        )

    elapsed_ms = (time.perf_counter() - started) * 1000.0
    return feats, elapsed_ms, truncated


_MAX_GEOCODE_SEARCH = 25


async def search_dc_addresses(
    session: AsyncSession, query: str, *, limit: int = 5
) -> Sequence[DcAddress]:
    """Prefix-style forward search over bundled MAR rows (Postgres FTS)."""

    capped = max(1, min(limit, _MAX_GEOCODE_SEARCH))
    tokens = normalize_dc_address_query_text(query).split()
    if not tokens:
        return ()
    fts_query = prefix_tsquery_from_tokens(tokens)
    if not fts_query:
        return ()

    match_clause = text(
        "to_tsvector('simple', dc_addresses.label_normalized) @@ "
        "to_tsquery('simple', :fts_query)"
    )
    rank_clause = text(
        "ts_rank_cd(to_tsvector('simple', dc_addresses.label_normalized), "
        "to_tsquery('simple', :fts_query))"
    )
    stmt = (
        select(DcAddress)
        .where(match_clause)
        .order_by(desc(rank_clause), asc(func.char_length(DcAddress.label_normalized)))
        .limit(capped)
    ).params(fts_query=fts_query)
    result = await session.scalars(stmt)
    return tuple(result.all())


async def reverse_dc_nearest_row(
    session: AsyncSession, lon: float, lat: float
) -> DcAddress | None:
    """Closest MAR snapshot point to `(lon, lat)` in geography meters."""

    point = gf.ST_GeographyFromText(literal(f"SRID=4326;POINT({lon} {lat})"))
    distance = gf.ST_Distance(DcAddress.geom, point)
    stmt = select(DcAddress).order_by(asc(distance)).limit(1)
    return (await session.scalars(stmt)).first()
