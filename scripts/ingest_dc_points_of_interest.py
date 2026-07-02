"""Load DC MAR "Points of Interest" alias rows into ``dc_points_of_interest``.

This layer (OCTO ArcGIS ``Location_WebMercator`` layer 3) carries no
coordinates of its own — each row is a named alias keyed to a `MAR_ID` in the
already-ingested ``dc_addresses`` table. Resolving a row therefore requires a
read-only join against ``dc_addresses``, so — unlike
``ingest_dc_addresses.py`` — this script needs a reachable database even in
``--dry-run`` mode (dry-run still skips writes, it just can't skip reads).

Usage
-----
Prerequisite: ``dc_addresses`` must already be populated
(``make ingest-dc-addresses``) — this script fetches/reads rows but resolves
each against the current address table.

Dry-run (validate ``data/dc_points_of_interest.jsonl`` against the DB)::

    uv run --directory apps/backend python \\
        scripts/ingest_dc_points_of_interest.py --dry-run

Apply the committed snapshot (preferred for local dev)::

    make ingest-dc-pois

Fetch a fresh copy from OCTO ArcGIS and write a new JSONL::

    uv run --directory apps/backend python scripts/ingest_dc_points_of_interest.py \\
        --fetch --write-jsonl data/dc_points_of_interest.jsonl --dry-run

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
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session, sessionmaker

REPO_ROOT = Path(__file__).resolve().parents[1]

if str(REPO_ROOT / "apps" / "backend") not in sys.path:
    sys.path.insert(0, str(REPO_ROOT / "apps" / "backend"))

from scout.config import load_settings, migrate_sync_database_url  # noqa: E402
from scout.data.mar_address_mapping import (  # noqa: E402
    format_mar_id,
    poi_object_id_and_mar_id_from_snapshot_line,
    poi_row_from_attributes_and_address,
    poi_row_from_snapshot_and_address,
    snapshot_line_from_poi_row,
)
from scout.data.models import DcAddress, DcPointOfInterest  # noqa: E402

DEFAULT_JSONL = REPO_ROOT / "data" / "dc_points_of_interest.jsonl"
MAR_QUERY_URL = (
    "https://maps2.dcgis.dc.gov/dcgis/rest/services/DCGIS_DATA/"
    "Location_WebMercator/FeatureServer/3/query"
)
_PAGE_SIZE = 2000
_HTTP_TIMEOUT_SEC = 120.0
_UPSERT_CHUNK = 750
_ADDRESS_LOOKUP_CHUNK = 5000

_PoiRow = tuple[str, str, str, str, str, float, float]


def configure_logging(level: str) -> logging.Logger:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(levelname)s %(message)s",
    )
    return logging.getLogger("ingest_dc_points_of_interest")


def fetch_all_features(log: logging.Logger) -> list[dict[str, Any]]:
    """Download MAR alias rows (attributes only) with ArcGIS pagination."""

    records: list[dict[str, Any]] = []
    offset = 0
    with httpx.Client(timeout=_HTTP_TIMEOUT_SEC) as client:
        while True:
            params = {
                "where": "1=1",
                "outFields": "NAME,STATUS,MAR_ID,OBJECTID",
                "returnGeometry": "false",
                "orderByFields": "OBJECTID",
                "resultOffset": offset,
                "resultRecordCount": _PAGE_SIZE,
                "f": "json",
            }
            log.info(
                "datasets=mar_poi fetch_offset=%s page_size=%s", offset, _PAGE_SIZE
            )
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


def resolve_addresses_by_mar_id(
    session: Session, mar_ids: set[str]
) -> dict[str, tuple[str, float, float]]:
    """Batched read-only lookup of `(label_full, lon, lat)` by `dc_addresses.id`."""

    resolved: dict[str, tuple[str, float, float]] = {}
    ids = sorted(mar_ids)
    for start in range(0, len(ids), _ADDRESS_LOOKUP_CHUNK):
        chunk = ids[start : start + _ADDRESS_LOOKUP_CHUNK]
        stmt = select(
            DcAddress.id, DcAddress.label_full, DcAddress.lon, DcAddress.lat
        ).where(DcAddress.id.in_(chunk))
        for row_id, label_full, lon, lat in session.execute(stmt):
            resolved[row_id] = (label_full, lon, lat)
    return resolved


def rows_from_arcgis_features(
    features: list[dict[str, Any]],
    address_by_mar_id: dict[str, tuple[str, float, float]],
) -> tuple[list[_PoiRow], int, int]:
    rows: list[_PoiRow] = []
    skipped_invalid = 0
    skipped_orphan = 0
    for feat in features:
        attrs_raw = feat.get("attributes")
        attrs = attrs_raw if isinstance(attrs_raw, dict) else {}
        mar_id = format_mar_id(attrs.get("MAR_ID"))
        address = address_by_mar_id.get(mar_id) if mar_id is not None else None
        if address is None:
            skipped_orphan += 1
            continue
        label_full, lon, lat = address
        row = poi_row_from_attributes_and_address(
            attrs, address_label_full=label_full, lon=lon, lat=lat
        )
        if row is None:
            skipped_invalid += 1
            continue
        rows.append(row)
    return rows, skipped_invalid, skipped_orphan


def rows_from_jsonl(
    path: Path,
    session: Session,
    log: logging.Logger,
) -> tuple[list[_PoiRow], int, int]:
    parsed: list[tuple[str, str, str]] = []
    skipped_invalid = 0
    with path.open(encoding="utf-8") as handle:
        for line_no, raw_line in enumerate(handle, start=1):
            stripped = raw_line.strip()
            if not stripped:
                continue
            try:
                obj = cast(dict[str, Any], json.loads(stripped))
            except json.JSONDecodeError:
                log.warning("invalid_json line=%s", line_no)
                skipped_invalid += 1
                continue
            snapshot = poi_object_id_and_mar_id_from_snapshot_line(obj)
            if snapshot is None:
                skipped_invalid += 1
                continue
            parsed.append(snapshot)

    address_by_mar_id = resolve_addresses_by_mar_id(
        session, {mar_id for _, mar_id, _ in parsed}
    )

    rows: list[_PoiRow] = []
    skipped_orphan = 0
    for object_id, mar_id, name in parsed:
        address = address_by_mar_id.get(mar_id)
        if address is None:
            skipped_orphan += 1
            continue
        label_full, lon, lat = address
        row = poi_row_from_snapshot_and_address(
            object_id, mar_id, name, address_label_full=label_full, lon=lon, lat=lat
        )
        if row is None:
            skipped_invalid += 1
            continue
        rows.append(row)
    return rows, skipped_invalid, skipped_orphan


def _row_to_payload(row: _PoiRow) -> dict[str, Any]:
    poi_id, mar_id, name, label_full, label_norm, lon, lat = row
    return {
        "id": poi_id,
        "mar_id": mar_id,
        "name": name,
        "label_full": label_full,
        "label_normalized": label_norm,
        "lon": lon,
        "lat": lat,
        "geom": WKTElement(f"POINT({lon} {lat})", srid=4326),
    }


def upsert_rows(session: Session, rows: list[_PoiRow]) -> None:
    table = DcPointOfInterest.__table__
    for start in range(0, len(rows), _UPSERT_CHUNK):
        chunk = rows[start : start + _UPSERT_CHUNK]
        payloads = [_row_to_payload(r) for r in chunk]
        stmt = insert(table).values(payloads)
        stmt = stmt.on_conflict_do_update(
            index_elements=[table.c.id],
            set_={
                "mar_id": stmt.excluded.mar_id,
                "name": stmt.excluded.name,
                "label_full": stmt.excluded.label_full,
                "label_normalized": stmt.excluded.label_normalized,
                "lon": stmt.excluded.lon,
                "lat": stmt.excluded.lat,
                "geom": stmt.excluded.geom,
            },
        )
        session.execute(stmt)


def write_jsonl(path: Path, rows: list[_PoiRow]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    def _sort_key(row: _PoiRow) -> tuple[int, str]:
        poi_id = row[0].removeprefix("poi:")
        if poi_id.isdigit():
            return (0, poi_id.zfill(20))
        return (1, poi_id)

    ordered = sorted(rows, key=_sort_key)
    with path.open("w", encoding="utf-8") as handle:
        for row in ordered:
            snapshot = snapshot_line_from_poi_row(row)
            handle.write(json.dumps(snapshot, sort_keys=True))
            handle.write("\n")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--jsonl-path",
        type=Path,
        default=DEFAULT_JSONL,
        help=f"path to MAR POI snapshot (default {DEFAULT_JSONL})",
    )
    parser.add_argument(
        "--database-url",
        default="",
        help="sync Postgres URL (defaults to migrated SCOUT_DATABASE_URL)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="parse + validate only; skip database writes (still reads "
        "dc_addresses to resolve coordinates)",
    )
    parser.add_argument(
        "--fetch",
        action="store_true",
        help="download MAR alias rows from ArcGIS instead of reading JSONL",
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

    settings = load_settings()
    dsn = (
        args.database_url.strip()
        if args.database_url.strip()
        else migrate_sync_database_url(settings.database_url)
    )
    engine = create_engine(dsn, future=True)
    session_factory = sessionmaker(engine, class_=Session, future=True)

    with session_factory() as session:
        if args.fetch:
            features = fetch_all_features(log)
            mar_ids = {
                mar_id
                for feat in features
                if (
                    mar_id := format_mar_id(
                        (feat.get("attributes") or {}).get("MAR_ID")
                    )
                )
                is not None
            }
            address_by_mar_id = resolve_addresses_by_mar_id(session, mar_ids)
            rows, skipped_invalid, skipped_orphan = rows_from_arcgis_features(
                features, address_by_mar_id
            )
            log.info(
                "datasets=mar_poi fetch_features=%s eligible=%s invalid=%s "
                "orphan_mar_id=%s",
                len(features),
                len(rows),
                skipped_invalid,
                skipped_orphan,
            )
        else:
            jsonl_path: Path = args.jsonl_path
            if not jsonl_path.exists():
                log.error("missing_jsonl path=%s", jsonl_path)
                return 2
            rows, skipped_invalid, skipped_orphan = rows_from_jsonl(
                jsonl_path, session, log
            )
            log.info(
                "datasets=jsonl path=%s eligible=%s invalid=%s orphan_mar_id=%s",
                jsonl_path,
                len(rows),
                skipped_invalid,
                skipped_orphan,
            )

        if args.write_jsonl is not None:
            write_jsonl(args.write_jsonl, rows)
            log.info("wrote_jsonl path=%s rows=%s", args.write_jsonl, len(rows))

        # The address-resolution reads above (`resolve_addresses_by_mar_id`)
        # auto-begin a transaction on this session; end it here (a no-op
        # commit — nothing was written) so `session.begin()` below can open
        # a fresh one for the upsert.
        session.commit()

        if args.dry_run:
            elapsed_ms = int((time.perf_counter() - started) * 1000)
            log.info(
                "datasets=1 eligible=%s invalid=%s orphan_mar_id=%s inserted=0 "
                "updated=0 unchanged=0 took_ms=%s",
                len(rows),
                skipped_invalid,
                skipped_orphan,
                elapsed_ms,
            )
            return 0

        with session.begin():
            upsert_rows(session, rows)

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    log.info(
        "datasets=1 eligible=%s invalid=%s orphan_mar_id=%s upserted=%s took_ms=%s",
        len(rows),
        skipped_invalid,
        skipped_orphan,
        len(rows),
        elapsed_ms,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
