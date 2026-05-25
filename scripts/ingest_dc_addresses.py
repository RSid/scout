"""Load DC Master Address Repository rows into ``dc_addresses``.

Usage
-----
Dry-run (validate ``data/dc_addresses.jsonl``)::

    uv run --directory apps/backend python scripts/ingest_dc_addresses.py --dry-run

Apply the committed snapshot (preferred for local dev)::

    make ingest-dc-addresses

Fetch a fresh copy from OCTO ArcGIS and write a new JSONL::

    uv run --directory apps/backend python scripts/ingest_dc_addresses.py \\
        --fetch --write-jsonl data/dc_addresses.jsonl --dry-run

Environment
-----------
``SCOUT_DATABASE_URL`` feeds the sync engine unless ``--database-url`` is set.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from pathlib import Path
from typing import Any, cast

import httpx
from geoalchemy2.elements import WKTElement
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

REPO_ROOT = Path(__file__).resolve().parents[1]

if str(REPO_ROOT / "apps" / "backend") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "apps" / "backend"))

from scout.config import load_settings, migrate_sync_database_url  # noqa: E402
from scout.data.mar_address_mapping import (  # noqa: E402
    dc_address_row_from_attributes,
    dc_address_row_from_snapshot_line,
    snapshot_line_from_row,
)
from scout.data.models import DcAddress  # noqa: E402

DEFAULT_JSONL = REPO_ROOT / "data" / "dc_addresses.jsonl"
MAR_QUERY_URL = (
    "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/"
    "Location_WebMercator/FeatureServer/0/query"
)
_PAGE_SIZE = 2000
_HTTP_TIMEOUT_SEC = 120.0
_UPSERT_CHUNK = 750


def configure_logging(level: str) -> logging.Logger:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(levelname)s %(message)s",
    )
    return logging.getLogger("ingest_dc_addresses")


def fetch_all_features(log: logging.Logger) -> list[dict[str, Any]]:
    """Download MAR rows (attributes only) with ArcGIS pagination."""

    records: list[dict[str, Any]] = []
    offset = 0
    with httpx.Client(timeout=_HTTP_TIMEOUT_SEC) as client:
        while True:
            params = {
                "where": "1=1",
                "outFields": "MAR_ID,ADDRESS,LATITUDE,LONGITUDE",
                "returnGeometry": "false",
                "orderByFields": "MAR_ID",
                "resultOffset": offset,
                "resultRecordCount": _PAGE_SIZE,
                "f": "json",
            }
            log.info("datasets=mar fetch_offset=%s page_size=%s", offset, _PAGE_SIZE)
            resp = client.get(MAR_QUERY_URL, params=params)
            resp.raise_for_status()
            payload = resp.json()
            feats = payload.get("features")
            if not isinstance(feats, list):
                msg = "unexpected ArcGIS payload (missing features list)"
                raise ValueError(msg)
            if not feats:
                break
            for feat in feats:
                if isinstance(feat, dict):
                    records.append(feat)
            if len(feats) < _PAGE_SIZE:
                break
            offset += len(feats)
    return records


def rows_from_arcgis_features(
    features: list[dict[str, Any]],
) -> tuple[list[tuple[str, str, str, float, float]], int]:
    rows: list[tuple[str, str, str, float, float]] = []
    skipped = 0
    for feat in features:
        attrs_raw = feat.get("attributes")
        attrs = attrs_raw if isinstance(attrs_raw, dict) else {}
        row = dc_address_row_from_attributes(attrs)
        if row is None:
            skipped += 1
            continue
        rows.append(row)
    return rows, skipped


def rows_from_jsonl(
    path: Path, log: logging.Logger
) -> tuple[list[tuple[str, str, str, float, float]], int]:
    rows: list[tuple[str, str, str, float, float]] = []
    skipped = 0
    with path.open(encoding="utf-8") as handle:
        for line_no, raw_line in enumerate(handle, start=1):
            stripped = raw_line.strip()
            if not stripped:
                continue
            try:
                obj = cast(dict[str, Any], json.loads(stripped))
            except json.JSONDecodeError:
                log.warning("invalid_json line=%s", line_no)
                skipped += 1
                continue
            parsed = dc_address_row_from_snapshot_line(obj)
            if parsed is None:
                skipped += 1
                continue
            rows.append(parsed)
    return rows, skipped


def _row_to_payload(
    row: tuple[str, str, str, float, float],
) -> dict[str, Any]:
    mar_id, label_full, label_norm, lon, lat = row
    return {
        "id": mar_id,
        "label_full": label_full,
        "label_normalized": label_norm,
        "lon": lon,
        "lat": lat,
        "geom": WKTElement(f"POINT({lon} {lat})", srid=4326),
    }


def upsert_rows(
    session: Session,
    rows: list[tuple[str, str, str, float, float]],
) -> None:
    table = DcAddress.__table__
    for start in range(0, len(rows), _UPSERT_CHUNK):
        chunk = rows[start : start + _UPSERT_CHUNK]
        payloads = [_row_to_payload(r) for r in chunk]
        stmt = insert(table).values(payloads)
        stmt = stmt.on_conflict_do_update(
            index_elements=[table.c.id],
            set_={
                "label_full": stmt.excluded.label_full,
                "label_normalized": stmt.excluded.label_normalized,
                "lon": stmt.excluded.lon,
                "lat": stmt.excluded.lat,
                "geom": stmt.excluded.geom,
            },
        )
        session.execute(stmt)


def write_jsonl(path: Path, rows: list[tuple[str, str, str, float, float]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    def _sort_key(row: tuple[str, str, str, float, float]) -> tuple[int, str]:
        mar_id = row[0]
        if mar_id.isdigit():
            return (0, mar_id.zfill(20))
        return (1, mar_id)

    ordered = sorted(rows, key=_sort_key)
    with path.open("w", encoding="utf-8") as handle:
        for row in ordered:
            snapshot = snapshot_line_from_row(row)
            handle.write(json.dumps(snapshot, sort_keys=True))
            handle.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--jsonl-path",
        type=Path,
        default=DEFAULT_JSONL,
        help=f"path to MAR snapshot (default {DEFAULT_JSONL})",
    )
    parser.add_argument(
        "--database-url",
        default="",
        help="sync Postgres URL (defaults to migrated SCOUT_DATABASE_URL)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="parse + validate only; skip database writes",
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="download MAR rows from ArcGIS instead of reading JSONL",
    )
    parser.add_argument(
        "--write-jsonl",
        type=Path,
        default=None,
        help="when using --fetch, write parsed rows here (implies --dry-run "
        "for DB unless explicitly loading)",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        help="logging level (default INFO)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    log = configure_logging(args.log_level)
    started = time.perf_counter()

    if args.fetch:
        features = fetch_all_features(log)
        rows, skipped_invalid = rows_from_arcgis_features(features)
        log.info(
            "datasets=mar fetch_features=%s eligible=%s invalid=%s",
            len(features),
            len(rows),
            skipped_invalid,
        )
    else:
        jsonl_path: Path = args.jsonl_path
        if not jsonl_path.exists():
            log.error("missing_jsonl path=%s", jsonl_path)
            return 2
        rows, skipped_invalid = rows_from_jsonl(jsonl_path, log)
        log.info(
            "datasets=jsonl path=%s eligible=%s invalid=%s",
            jsonl_path,
            len(rows),
            skipped_invalid,
        )

    if args.write_jsonl is not None:
        write_jsonl(args.write_jsonl, rows)
        log.info("wrote_jsonl path=%s rows=%s", args.write_jsonl, len(rows))

    if args.dry_run:
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        log.info(
            "datasets=1 eligible=%s invalid=%s inserted=0 updated=0 unchanged=0 "
            "took_ms=%s",
            len(rows),
            skipped_invalid,
            elapsed_ms,
        )
        return 0

    settings = load_settings()
    dsn = (
        args.database_url.strip()
        if args.database_url.strip()
        else migrate_sync_database_url(settings.database_url)
    )

    engine = create_engine(dsn, future=True)
    session_factory = sessionmaker(engine, class_=Session, future=True)

    with session_factory() as session:
        with session.begin():
            upsert_rows(session, rows)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "datasets=1 eligible=%s invalid=%s upserted=%s took_ms=%s",
        len(rows),
        skipped_invalid,
        len(rows),
        elapsed_ms,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
