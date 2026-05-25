"""DC feature ingest orchestration (used by CLI and tests)."""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any, cast

import httpx
from geoalchemy2.elements import WKTElement
from sqlalchemy import func, literal_column, or_
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.schema import Table
from sqlalchemy.sql import Executable

from scout.data.models import Feature
from scout.ingest.dc import DatasetSpec, NormalizedRow, load_geojson_feature_collection
from scout.ingest.osm import (
    USER_AGENT,
    fetch_overpass_benches,
    fetch_overpass_drinking_water,
)


def geojson_props_from_normalized(row: NormalizedRow) -> dict[str, Any]:
    """ORM insert payload excluding server-managed timestamps."""

    return {
        "id": row.id,
        "category": row.category,
        "kind": row.kind,
        "condition": row.condition,
        "condition_normalized": row.condition_normalized,
        "inspected_year": row.inspected_year,
        "source_dataset": row.source_dataset,
        "source_id": row.source_id,
        "attributes": row.attributes,
        "geom": WKTElement(f"POINT({row.lon} {row.lat})", srid=4326),
    }


DIFFABLE_COLUMNS: tuple[str, ...] = (
    "category",
    "kind",
    "condition",
    "condition_normalized",
    "inspected_year",
    "source_dataset",
    "source_id",
    "attributes",
    "geom",
)


def _is_insert_flag(val: object) -> bool:
    return val is True or val == 1


def _bulk_upsert_chunk(
    conn: Connection, batch: Sequence[NormalizedRow]
) -> tuple[int, int, int]:
    """Return ``(inserted, updated, unchanged)`` counts for ``batch``."""

    payloads = [geojson_props_from_normalized(row) for row in batch]
    tbl = cast(Table, Feature.__mapper__.local_table)
    stmt = pg_insert(tbl).values(payloads)
    excluded = stmt.excluded

    predicates = [
        tbl.c[col].is_distinct_from(excluded[col]) for col in DIFFABLE_COLUMNS
    ]
    predicate = or_(*predicates) if predicates else literal_column("false")

    set_map = {tbl.c[column]: getattr(excluded, column) for column in DIFFABLE_COLUMNS}
    set_map[tbl.c.updated_at] = func.now()

    stmt = stmt.on_conflict_do_update(
        index_elements=[tbl.c.id],
        set_=set_map,
        where=predicate,
    )
    stmt_final = stmt.returning(
        tbl.c.id,
        literal_column("(xmax = 0)::boolean").label("fresh_insert"),
    )
    fetched = conn.execute(cast(Executable, stmt_final)).fetchall()

    inserts = sum(1 for row in fetched if _is_insert_flag(row[1]))
    updates = len(fetched) - inserts
    unchanged = len(batch) - len(fetched)
    return inserts, updates, unchanged


def upsert_normalized_rows(
    engine: Engine, rows: Sequence[NormalizedRow]
) -> tuple[int, int, int]:
    """One transaction inserting / updating every row in ``rows``."""

    chunk_size = 512
    total_inserted = total_updated = total_unchanged = 0
    with engine.begin() as conn:
        for idx in range(0, len(rows), chunk_size):
            chunk = rows[idx : idx + chunk_size]
            ins, upd, unch = _bulk_upsert_chunk(conn, chunk)
            total_inserted += ins
            total_updated += upd
            total_unchanged += unch
    return total_inserted, total_updated, total_unchanged


def load_dc_normalized_rows(
    data_dir: Path,
    *,
    datasets: Iterable[DatasetSpec],
) -> tuple[list[NormalizedRow], int]:
    """Load GeoJSON files from disk."""

    rows: list[NormalizedRow] = []
    malformed = 0
    for spec in datasets:
        path = data_dir / spec.filename
        if not path.is_file():
            msg = (
                f"Ingest skipped missing GeoJSON ({path}); expected OpenData artifact."
            )
            raise FileNotFoundError(msg)
        raw_any = json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(raw_any, dict):
            malformed += 1
            continue
        feats_raw, geo_skip = load_geojson_feature_collection(raw_any)
        malformed += geo_skip
        for feat in feats_raw:
            normed = spec.mapper(feat)
            if normed is None:
                malformed += 1
                continue
            rows.append(normed)
    return rows, malformed


def load_osm_rows(*, client: httpx.Client, include_osm: bool) -> list[NormalizedRow]:
    """Fetch benches + fountains when enabled."""

    if not include_osm:
        return []
    rows = list(fetch_overpass_benches(client=client))
    rows.extend(fetch_overpass_drinking_water(client=client))
    return rows


def categorize_rows(rows: Iterable[NormalizedRow]) -> tuple[Counter[str], Counter[str]]:
    cat_counts = Counter(row.category for row in rows)
    cond_counts = Counter(row.condition_normalized for row in rows)
    return cat_counts, cond_counts


def gathered_rows_summary(
    data_dir: Path,
    *,
    datasets: Iterable[DatasetSpec],
    include_osm: bool,
    http_client: httpx.Client | None = None,
) -> tuple[list[NormalizedRow], int]:
    """Return combined DC (+ optional OSM) rows plus malformed skips."""

    dc_rows, malformed = load_dc_normalized_rows(data_dir, datasets=datasets)
    rows = list(dc_rows)
    own_client = http_client is None
    client = http_client or httpx.Client(headers={"User-Agent": USER_AGENT})
    try:
        rows.extend(load_osm_rows(client=client, include_osm=include_osm))
    finally:
        if own_client:
            client.close()
    return rows, malformed
