"""DC OpenData (+ OSM Overpass) → PostGIS `features` ingestion (M1-F11 / M1-T03).

Reads each enabled GeoJSON under `data/`, normalizes per
`docs/appendix-data-schema.md` §B, and upserts into `features` in a single
transaction so a mid-run failure leaves the DB untouched.

Usage:

    uv run python scripts/ingest_dc.py [--dry-run] \
        [--include-osm | --no-include-osm] \
        [--database-url URL] [--log-level LEVEL]

Idempotency: rows are keyed by `id = "{source_dataset}:{source_id}"` and the
upsert clause uses `ON CONFLICT (id) DO UPDATE ... WHERE <content changed>`.
Re-running with unchanged inputs yields `inserted=0 updated=0 unchanged=N`.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from collections import Counter
from collections.abc import Iterable, Iterator, Mapping
from pathlib import Path
from typing import Any

import sqlalchemy as sa
from geoalchemy2.elements import WKTElement
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import Connection, Engine, create_engine

# `scripts/` is on `sys.path` via `apps/backend/pyproject.toml` pytest config
# and via `PYTHONPATH=/app/apps/backend` in the Compose `ingest` service. The
# explicit insert below makes direct `python scripts/ingest_dc.py` invocations
# (without `uv run --directory apps/backend`) work too.
REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))
sys.path.insert(0, str(REPO_ROOT / "apps" / "backend"))

from _dc_mappers import (  # noqa: E402
    DATASETS_ENABLED,
    DATASETS_SKIPPED,
    IngestSource,
    MappedRow,
    SkippedSource,
    normalize_osm_amenity,
)
from _osm_overpass import OsmAmenity, fetch_amenity  # noqa: E402

from scout.config import migrate_sync_database_url  # noqa: E402
from scout.data.models import Feature  # noqa: E402

_log = logging.getLogger("scout.ingest")

UPDATABLE_COLS: tuple[str, ...] = (
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
CHUNK_SIZE = 5000
OSM_AMENITIES: tuple[OsmAmenity, ...] = ("bench", "drinking_water")


class IngestSummary:
    """Mutable totals threaded through the run; logged as one INFO line at exit."""

    def __init__(self) -> None:
        self.datasets = 0
        self.per_category: Counter[str] = Counter()
        self.inserted = 0
        self.updated = 0
        self.unchanged = 0

    @property
    def features_total(self) -> int:
        return sum(self.per_category.values())


def _resolve_path(rel_path: str) -> Path:
    return REPO_ROOT / rel_path


def _load_geojson_features(path: Path) -> list[Mapping[str, Any]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    features = payload.get("features")
    if not isinstance(features, list):
        raise ValueError(f"{path} is not a GeoJSON FeatureCollection")
    return features


def _dc_rows(sources: Iterable[IngestSource]) -> Iterator[MappedRow]:
    for src in sources:
        path = _resolve_path(src.path)
        raw_features = _load_geojson_features(path)
        _log.info(
            "loaded dataset id=%s features=%d path=%s",
            src.source_dataset,
            len(raw_features),
            src.path,
        )
        for raw in raw_features:
            try:
                yield src.normalize(raw)
            except (KeyError, ValueError, TypeError) as exc:
                gis_id = raw.get("properties", {}).get("GIS_ID")
                _log.error(
                    "mapping failed dataset=%s gis_id=%s error=%s",
                    src.source_dataset,
                    gis_id,
                    type(exc).__name__,
                )
                raise


def _osm_rows(cache_dir: Path) -> Iterator[MappedRow]:
    for amenity in OSM_AMENITIES:
        elements = fetch_amenity(amenity, cache_dir=cache_dir)
        _log.info(
            "loaded dataset id=osm_overpass_%s elements=%d",
            amenity,
            len(elements),
        )
        for node in elements:
            yield normalize_osm_amenity(node, amenity=amenity)


def _to_db_row(row: MappedRow) -> dict[str, Any]:
    return {
        "id": row["id"],
        "category": row["category"],
        "kind": row["kind"],
        "condition": row["condition"],
        "condition_normalized": row["condition_normalized"],
        "inspected_year": row["inspected_year"],
        "source_dataset": row["source_dataset"],
        "source_id": row["source_id"],
        "attributes": row["attributes"],
        "geom": WKTElement(f"POINT({row['lon']} {row['lat']})", srid=4326),
    }


def _chunked(rows: list[dict[str, Any]], size: int) -> Iterator[list[dict[str, Any]]]:
    for start in range(0, len(rows), size):
        yield rows[start : start + size]


def _build_distinct_where(stmt: Any) -> Any:
    """Skip the UPDATE when no UPDATABLE_COL value actually differs.

    PostgreSQL's `ON CONFLICT ... DO UPDATE ... WHERE` evaluates per-row; when
    the predicate is false the row is left untouched and is not returned by
    RETURNING. That is exactly how we tell "unchanged" from "updated".

    For the geography column we cast both sides to binary because the default
    `IS DISTINCT FROM` operator class on PostGIS geography is implementation-
    defined; EWKB byte equality is deterministic.
    """

    clauses: list[Any] = []
    for col in UPDATABLE_COLS:
        existing = getattr(Feature, col)
        incoming = getattr(stmt.excluded, col)
        if col == "geom":
            clauses.append(
                sa.func.ST_AsBinary(existing).is_distinct_from(
                    sa.func.ST_AsBinary(incoming)
                )
            )
        else:
            clauses.append(existing.is_distinct_from(incoming))
    return sa.or_(*clauses)


def _upsert_chunk(conn: Connection, chunk: list[dict[str, Any]]) -> tuple[int, int]:
    """Return ``(inserted, updated)`` for one chunk.

    ``unchanged`` is derived by the caller.
    """

    stmt = pg_insert(Feature).values(chunk)
    set_clause: dict[str, Any] = {
        col: getattr(stmt.excluded, col) for col in UPDATABLE_COLS
    }
    set_clause["updated_at"] = sa.func.now()
    # `Any` because SQLAlchemy's chained DSL loses the concrete Insert subtype
    # after `.returning(...)`; the call site only needs the executable Statement.
    upsert: Any = stmt.on_conflict_do_update(
        index_elements=[Feature.id],
        set_=set_clause,
        where=_build_distinct_where(stmt),
    ).returning(Feature.id, sa.literal_column("(xmax = 0)").label("inserted_flag"))
    rows = conn.execute(upsert).all()
    inserted = sum(1 for r in rows if r.inserted_flag)
    updated = len(rows) - inserted
    return inserted, updated


def _write_to_db(
    engine: Engine, rows: list[dict[str, Any]], summary: IngestSummary
) -> None:
    """One transaction over the whole ingest. On any error, rollback (DEC-019)."""

    with engine.begin() as conn:
        for chunk in _chunked(rows, CHUNK_SIZE):
            inserted, updated = _upsert_chunk(conn, chunk)
            summary.inserted += inserted
            summary.updated += updated
            summary.unchanged += len(chunk) - inserted - updated


def run_ingest(
    *,
    database_url: str,
    dry_run: bool,
    include_osm: bool,
    sources: tuple[IngestSource, ...] = DATASETS_ENABLED,
    skipped: tuple[SkippedSource, ...] = DATASETS_SKIPPED,
    osm_cache_dir: Path | None = None,
    summary: IngestSummary | None = None,
) -> IngestSummary:
    """Entry point — usable from the CLI and from tests.

    `sources` / `skipped` / `osm_cache_dir` are seams that production callers
    leave at their defaults; tests inject deterministic fixtures.
    """

    summary = summary or IngestSummary()
    started = time.perf_counter()
    _log.info(
        "ingest start dry_run=%s include_osm=%s database_url_set=%s",
        dry_run,
        include_osm,
        bool(database_url),
    )

    for skip in skipped:
        _log.info(
            "skipping dataset id=%s reason=%s",
            skip.source_dataset,
            skip.reason,
        )

    all_rows: list[dict[str, Any]] = []
    summary.datasets = len(sources)
    for mapped in _dc_rows(sources):
        summary.per_category[mapped["category"]] += 1
        all_rows.append(_to_db_row(mapped))

    if include_osm:
        summary.datasets += len(OSM_AMENITIES)
        cache_dir = osm_cache_dir or (REPO_ROOT / "data" / "derived")
        for mapped in _osm_rows(cache_dir):
            summary.per_category[mapped["category"]] += 1
            all_rows.append(_to_db_row(mapped))

    if dry_run:
        _log.info(
            "ingest dry-run datasets=%d features_total=%d "
            "features_per_category=%s took_ms=%.1f",
            summary.datasets,
            summary.features_total,
            dict(summary.per_category),
            (time.perf_counter() - started) * 1000.0,
        )
        return summary

    engine = create_engine(migrate_sync_database_url(database_url))
    try:
        _write_to_db(engine, all_rows, summary)
    finally:
        engine.dispose()

    _log.info(
        "ingest complete datasets=%d features_total=%d "
        "features_per_category=%s inserted=%d updated=%d unchanged=%d took_ms=%.1f",
        summary.datasets,
        summary.features_total,
        dict(summary.per_category),
        summary.inserted,
        summary.updated,
        summary.unchanged,
        (time.perf_counter() - started) * 1000.0,
    )
    return summary


def _parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="ingest_dc.py",
        description="Ingest DC OpenData GeoJSONs (+ OSM amenities) into PostGIS.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse, normalize, count; do not open a write transaction.",
    )
    parser.add_argument(
        "--include-osm",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Fetch bench + drinking_water nodes via the Overpass API.",
    )
    parser.add_argument(
        "--database-url",
        default=os.environ.get(
            "SCOUT_DATABASE_URL",
            "postgresql+asyncpg://scout:scout@localhost:5432/postgres",
        ),
        help="Overrides SCOUT_DATABASE_URL. Converted to a sync driver internally.",
    )
    parser.add_argument(
        "--log-level",
        default=os.environ.get("SCOUT_LOG_LEVEL", "INFO"),
        help="Standard `logging` level name (default INFO).",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = _parse_args(argv)
    logging.basicConfig(
        level=args.log_level,
        format="%(asctime)s %(levelname)s %(name)s | %(message)s",
    )
    try:
        run_ingest(
            database_url=args.database_url,
            dry_run=args.dry_run,
            include_osm=args.include_osm,
        )
    except Exception:
        _log.exception("ingest failed")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
