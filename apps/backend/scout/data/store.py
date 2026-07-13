"""PostGIS query helpers."""

from __future__ import annotations

import time
from collections.abc import Sequence
from typing import Any

from geoalchemy2 import Geometry
from geoalchemy2 import functions as gf
from geoalchemy2.functions import ST_DWithin, ST_LineLocatePoint, ST_SetSRID
from geoalchemy2.shape import to_shape
from sqlalchemy import (
    BindParameter,
    Row,
    Select,
    and_,
    asc,
    bindparam,
    desc,
    func,
    literal,
    literal_column,
    not_,
    or_,
    select,
    union_all,
)
from sqlalchemy import cast as sa_cast
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.sql import ColumnElement

from scout.data.mar_address_mapping import (
    normalize_dc_address_query_text,
    prefix_tsquery_from_tokens,
)
from scout.data.models import DcAddress, DcPointOfInterest, Feature

# Per-row "is this useful as a map marker?" rule. We still ingest these rows
# (analytics and M2 P3 low-vision routing weights both read them), but the
# corridor query for end-user rendering hides them from BOTH the response
# payload AND `feature_count_total` — otherwise the "(N) along your route"
# header counts features that never appear on the map.
#
# Currently: an `audible_signals` row whose `condition_normalized` is `"absent"`
# (no audible button at the intersection) or `"n_a"` (PUSHBUTTON_TYPE was null
# in the source GeoJSON) is metadata, not a feature on the ground.
_NON_RENDERABLE_CORRIDOR_PAIRS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("audible_signals", ("absent", "n_a")),
)


def _renderable_corridor_filter() -> ColumnElement[bool]:
    """SQL where-clause that excludes non-renderable corridor rows."""
    excluded = [
        and_(
            Feature.category == cat,
            Feature.condition_normalized.in_(conditions),
        )
        for cat, conditions in _NON_RENDERABLE_CORRIDOR_PAIRS
    ]
    return not_(or_(*excluded))


def _linestring_geography_wkt(coordinates: Sequence[Sequence[float]]) -> str:
    pairs = ",".join(f"{float(lon)} {float(lat)}" for lon, lat in coordinates)
    return f"LINESTRING({pairs})"


def _corridor_geographies(
    coordinates: Sequence[Sequence[float]],
) -> tuple[ColumnElement[Any], ColumnElement[Any]]:
    """Geometry handles for one route.

    `line_geography` drives metric `ST_DWithin`/`ST_Length` (meters, no
    reprojection per DEC-019); `route_geom` is the SRID-4326 geometry that
    `ST_LineLocatePoint` needs to compute the along-route fraction.
    """
    ls_wkt = _linestring_geography_wkt(coordinates)
    line_geography = gf.ST_GeographyFromText(literal(f"SRID=4326;{ls_wkt}"))
    route_geom = ST_SetSRID(gf.ST_GeomFromText(literal(ls_wkt)), literal(4326))
    return line_geography, route_geom


def _corridor_match_filters(
    categories: Sequence[str],
    line_geography: ColumnElement[Any],
    buffer_meters: float,
) -> tuple[ColumnElement[bool], ...]:
    """WHERE clauses shared by the uncapped count and the page query."""
    return (
        Feature.category.in_(tuple(categories)),
        ST_DWithin(Feature.geom, line_geography, literal(buffer_meters)),
        _renderable_corridor_filter(),
    )


def corridor_features_select(
    coordinates: Sequence[Sequence[float]],
    categories: Sequence[str],
    buffer_meters: float,
    *,
    limit: int = 500,
) -> Select[tuple[Feature, float, int]]:
    """The corridor page query: buffered match, along-route order, +1 cap probe.

    Extracted from `corridor_features_geojson` so the SQL contract (M1-F07 S2/S3:
    `ST_DWithin` filter, `ST_LineLocatePoint` ordering — not `ST_Distance` —,
    category allow-list, and the 500 cap) is unit-testable without a live
    PostGIS database. See `tests/test_store_corridor_query.py`.

    Each result row carries ``total_count`` (window ``COUNT(*) OVER()``) so the
    caller gets the uncapped match count without a separate query.
    """
    line_geography, route_geom = _corridor_geographies(coordinates)
    point_geom = sa_cast(
        Feature.geom, Geometry(srid=4326, spatial_index=False, dimension=2)
    )
    along_route = ST_LineLocatePoint(route_geom, point_geom).label("along_route")
    total_count = func.count().over().label("total_count")
    return (
        select(Feature, along_route, total_count)
        .where(*_corridor_match_filters(categories, line_geography, buffer_meters))
        .order_by(along_route.asc(), Feature.id.asc())
        .limit(limit + 1)
    )


async def corridor_features_geojson(
    session: AsyncSession,
    *,
    coordinates: Sequence[Sequence[float]],
    categories: Sequence[str],
    buffer_meters: float,
    limit: int = 500,
) -> tuple[list[dict[str, Any]], float, bool, int]:
    """Buffered corridor intersection + along-route ordering.

    Returns GeoJSON-ish feature dicts, elapsed ms, truncation flag,
    and the total matching row count (uncapped).
    """

    started = time.perf_counter()
    line_geography, _route_geom = _corridor_geographies(coordinates)
    route_length_stmt = select(gf.ST_Length(line_geography))
    route_length_m = float((await session.execute(route_length_stmt)).scalar_one())

    stmt = corridor_features_select(coordinates, categories, buffer_meters, limit=limit)
    rows = (await session.execute(stmt)).all()

    truncated = len(rows) > limit
    if truncated:
        rows = rows[:limit]

    # total_count comes from COUNT(*) OVER() on every row; 0 when no rows match.
    feature_count_total = int(rows[0][2]) if rows else 0

    feats: list[dict[str, Any]] = []
    for row in rows:
        feature_row: Feature = row[0]
        frac_raw = row[1]
        frac = float(frac_raw) if frac_raw is not None else 0.0
        geom_shape = to_shape(feature_row.geom)
        coords = [float(geom_shape.x), float(geom_shape.y)]
        along_route_meters = round(frac * route_length_m, 1)
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
            "along_route_meters": along_route_meters,
        }
        feats.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": coords},
                "properties": {k: v for k, v in props.items()},
            }
        )

    elapsed_ms = (time.perf_counter() - started) * 1000.0
    return feats, elapsed_ms, truncated, feature_count_total


_MAX_GEOCODE_SEARCH = 25


def _fts_match_and_rank(
    label_normalized_column: ColumnElement[str] | InstrumentedAttribute[str],
    fts_query_param: ColumnElement[str],
) -> tuple[ColumnElement[bool], ColumnElement[float]]:
    """Shared `to_tsvector`/`ts_rank_cd` expressions for one geocoder source
    table. `fts_query_param` is a single reused `bindparam` so both the match
    filter and the rank expression — across both unioned subqueries — draw
    from the same bound value.

    The `'simple'` config name is rendered as inline SQL text (not a bound
    parameter): asyncpg pre-types bound params, and a `varchar`-typed
    parameter has no implicit cast to Postgres's `regconfig` — only an
    untyped string literal does.
    """
    simple_config: ColumnElement[str] = literal_column("'simple'")
    tsvector = func.to_tsvector(simple_config, label_normalized_column)
    tsquery = func.to_tsquery(simple_config, fts_query_param)
    match_clause = tsvector.bool_op("@@")(tsquery)
    rank_clause = func.ts_rank_cd(tsvector, tsquery)
    return match_clause, rank_clause


def search_dc_addresses_select(query: str, *, limit: int = 5) -> Select[Any] | None:
    """Ranked `UNION ALL` across bundled MAR addresses + named places (DEC-026).

    Blends `dc_addresses` and `dc_points_of_interest` into one ranked
    result set so a query like "national building" can surface a named
    place above unrelated addresses, while a plain address query (no POI
    token matches) degenerates to exactly the pre-DEC-026 `dc_addresses`-only
    ranking. Extracted from `search_dc_addresses` so the SQL shape is
    unit-testable without a live PostGIS database — see
    `tests/test_store_geocode_query.py`.

    Returns `None` when the query normalizes to no searchable tokens.
    """
    capped = max(1, min(limit, _MAX_GEOCODE_SEARCH))
    tokens = normalize_dc_address_query_text(query).split()
    if not tokens:
        return None
    fts_query = prefix_tsquery_from_tokens(tokens)
    if not fts_query:
        return None

    fts_param: BindParameter[str] = bindparam("fts_query", value=fts_query)

    addr_match, addr_rank = _fts_match_and_rank(DcAddress.label_normalized, fts_param)
    addr_sub = select(
        DcAddress.id.label("id"),
        DcAddress.label_full.label("label_full"),
        DcAddress.lon.label("lon"),
        DcAddress.lat.label("lat"),
        addr_rank.label("rank"),
        func.char_length(DcAddress.label_normalized).label("label_len"),
    ).where(addr_match)

    poi_match, poi_rank = _fts_match_and_rank(
        DcPointOfInterest.label_normalized, fts_param
    )
    poi_sub = select(
        DcPointOfInterest.id.label("id"),
        DcPointOfInterest.label_full.label("label_full"),
        DcPointOfInterest.lon.label("lon"),
        DcPointOfInterest.lat.label("lat"),
        poi_rank.label("rank"),
        func.char_length(DcPointOfInterest.label_normalized).label("label_len"),
    ).where(poi_match)

    hits = union_all(addr_sub, poi_sub).subquery("hits")
    return select(hits).order_by(desc(hits.c.rank), asc(hits.c.label_len)).limit(capped)


async def search_dc_addresses(
    session: AsyncSession, query: str, *, limit: int = 5
) -> Sequence[Row[Any]]:
    """Prefix-style forward search over bundled MAR addresses + named places.

    Each row exposes `.id` / `.label_full` / `.lon` / `.lat` regardless of
    which source table it came from — see `search_dc_addresses_select`.
    """

    stmt = search_dc_addresses_select(query, limit=limit)
    if stmt is None:
        return ()
    result = await session.execute(stmt)
    return tuple(result.all())


async def reverse_dc_nearest_row(
    session: AsyncSession, lon: float, lat: float
) -> DcAddress | None:
    """Closest MAR snapshot point to `(lon, lat)` in geography meters."""

    point = gf.ST_GeographyFromText(literal(f"SRID=4326;POINT({lon} {lat})"))
    distance = gf.ST_Distance(DcAddress.geom, point)
    stmt = select(DcAddress).order_by(asc(distance)).limit(1)
    return (await session.scalars(stmt)).first()
