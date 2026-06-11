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

From your laptop, keep ``SCOUT_DATABASE_URL`` on ``db``, ``localhost``, or
loopback; set ``SCOUT_DB_HOST_PORT`` to the Compose-published port and ingest
(and Alembic) will reconnect to ``127.0.0.1:<that port>``. See README.

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
from sqlalchemy.exc import OperationalError

from scout.config import (
    load_settings,
    migrate_sync_database_url,
    normalize_database_url_for_compose_host_port,
)
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

    settings_bundle = load_settings()
    chosen_async = parsed.database_url or settings_bundle.database_url
    async_for_engine = normalize_database_url_for_compose_host_port(
        chosen_async,
        compose_published_host_port=settings_bundle.db_host_port,
    )
    if async_for_engine != chosen_async:
        log.info(
            "event=compose_host_port_applied published_port=%s",
            settings_bundle.db_host_port,
        )
    settings_db = migrate_sync_database_url(async_for_engine)
    engine = create_engine(settings_db)

    try:
        inserts, updates, skips = upsert_normalized_rows(engine, rows)
    except OperationalError as exc:
        orig = getattr(exc, "orig", None)
        detail_msg = repr(orig) if orig is not None else str(exc)
        log.error(
            "event=ingest_failed reason=postgres_unavailable detail=%s",
            detail_msg,
        )
        log.error(
            "hint=Host-side ingest must reach the Scout Compose database. With "
            "SCOUT_DATABASE_URL targeting db/localhost and SCOUT_DB_HOST_PORT set "
            "in `.env`, the script rewrites to 127.0.0.1:<that port> automatically. "
            "Otherwise set DATABASE_URL/`--database-url` to the published port."
        )
        log.error(
            "hint_password_auth=A different Postgres on the attempted port "
            "often causes scout password failures — fix the published port mapping "
            "or point SCOUT_DATABASE_URL at the server you intend."
        )
        raise
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
