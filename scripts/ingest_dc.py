"""CLI: ingest DC GeoJSON (+ optional OSM amenities) into PostGIS.

Loads the six ADA point exports under ``data/`` (skipping *Accessible Parking
Zones*, which stays on disk only) and optionally enriches with Overpass benches
+fountains documented in ``docs/appendix-data-schema.md``.

Usage::

  uv sync --directory apps/backend

  uv run --directory apps/backend python scripts/ingest_dc.py --dry-run
  uv run --directory apps/backend python scripts/ingest_dc.py --no-include-osm
  uv run --directory apps/backend python \\
    scripts/ingest_dc.py --database-url postgresql+psycopg://...

Inputs: ADA GeoJSON in ``data/``. Output: UPSERT rows into Postgres ``features``
table owned by Alembic (no DDL here).
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from pathlib import Path

from sqlalchemy import create_engine

from scout.config import load_settings, migrate_sync_database_url
from scout.ingest.dc import DATASETS
from scout.ingest.pipeline import (
    categorize_rows,
    gathered_rows_summary,
    load_dc_normalized_rows,
    upsert_normalized_rows,
)


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _configure_logging(level: str) -> None:
    lvl = getattr(logging, level.upper(), logging.INFO)
    logging.basicConfig(level=lvl, format="%(message)s")


def build_arg_parser() -> argparse.ArgumentParser:
    repo = _repo_root()
    parser = argparse.ArgumentParser(
        description=(
            "Map DC ADA GeoJSON exports into Postgres/PostGIS "
            "(idempotent `features` UPSERT)."
        ),
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=repo / "data",
        help="Folder containing ADA_*.geojson snapshots.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse + tally categories offline (skips OSM / Overpass).",
    )
    parser.add_argument(
        "--include-osm",
        default=True,
        action=argparse.BooleanOptionalAction,
        help=(
            "Fetch benches & drinking fountains from Overpass (ignored when "
            "--dry-run is set)."
        ),
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="PostgreSQL SQLAlchemy DSN overriding SCOUT_DATABASE_URL.",
    )
    parser.add_argument("--log-level", default="INFO", help="Python logging verbosity.")
    return parser


def main(argv: list[str] | None = None) -> int:
    args = argv if argv is not None else sys.argv[1:]
    parser = build_arg_parser()
    parsed = parser.parse_args(args)

    resolved_data_dir = parsed.data_dir.expanduser().resolve()

    log = logging.getLogger("scout.ingest_dc")
    _configure_logging(parsed.log_level)
    datasets_count = len(DATASETS)
    t0_ms = time.monotonic()
    outbound_osm = (not parsed.dry_run) and parsed.include_osm
    log.info(
        "event=ingest_start datasets=%s include_osm=%s dry_run=%s",
        datasets_count,
        str(outbound_osm).lower(),
        str(parsed.dry_run).lower(),
    )

    if parsed.dry_run:
        rows, malformed = load_dc_normalized_rows(resolved_data_dir, datasets=DATASETS)
    else:
        rows, malformed = gathered_rows_summary(
            resolved_data_dir,
            datasets=DATASETS,
            include_osm=parsed.include_osm,
        )

    cats, norms = categorize_rows(rows)
    for key, count in sorted(cats.items()):
        log.info(
            "event=tally_component component=category name=%s count=%s", key, count
        )
    for key, count in sorted(norms.items()):
        log.info(
            "event=tally_component component=condition name=%s count=%s", key, count
        )

    if malformed:
        log.warning(
            "event=tally_component component=malformed_geojson_rows count=%s",
            malformed,
        )

    duration_ms = int((time.monotonic() - t0_ms) * 1000)

    if parsed.dry_run:
        log.info(
            "event=ingest_done datasets=%s dry_run=true parsed_rows=%s malformed=%s "
            "took_ms=%s",
            datasets_count,
            len(rows),
            malformed,
            duration_ms,
        )
        return 0

    settings_db = migrate_sync_database_url(
        parsed.database_url or load_settings().database_url
    )
    engine = create_engine(settings_db)

    inserts, updates, skips = upsert_normalized_rows(engine, rows)
    log.info(
        "event=ingest_done datasets=%s dry_run=false inserted=%s updated=%s "
        "unchanged=%s malformed=%s rows=%s took_ms=%s",
        datasets_count,
        inserts,
        updates,
        skips,
        malformed,
        len(rows),
        int((time.monotonic() - t0_ms) * 1000),
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
