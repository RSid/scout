"""SQLAlchemy ORM models (DEC-019)."""

from __future__ import annotations

from datetime import datetime

from geoalchemy2 import Geography
from geoalchemy2.elements import WKBElement
from sqlalchemy import DateTime, Float, SmallInteger, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import func


class Base(DeclarativeBase):
    pass


class Feature(Base):  # noqa: D401
    __tablename__ = "features"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    condition: Mapped[str | None] = mapped_column(Text, nullable=True)
    condition_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    inspected_year: Mapped[int | None] = mapped_column(SmallInteger, nullable=True)
    source_dataset: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    # Nearest DC street-centerline name, derived once at ingest (DEC-027).
    # First-class + nullable so it stays queryable and the future
    # intersection upgrade has a home; restroom rows never set it.
    street_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    attributes: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
        server_default="{}",
    )
    geom: Mapped[WKBElement] = mapped_column(
        Geography(geometry_type="POINT", srid=4326), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class DcAddress(Base):  # noqa: D401 — ORM table for bundled DC MAR autocomplete
    """Single address row from the DC Master Address Repository snapshot."""

    __tablename__ = "dc_addresses"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    label_full: Mapped[str] = mapped_column(Text, nullable=False)
    label_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    geom: Mapped[WKBElement] = mapped_column(
        Geography(geometry_type="POINT", srid=4326),
        nullable=False,
    )


class DcStreetSegment(Base):  # noqa: D401 — ORM table for DC street centerlines
    """One DC street-centerline (SubBlock) segment from the OCTO snapshot.

    Populated offline by ``scripts/ingest_dc_street_segments.py``; the KNN
    join in ``store.nearest_street_name_select`` reads it to stamp each
    ``features`` row with its nearest street name (DEC-027).
    """

    __tablename__ = "dc_street_segments"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    geom: Mapped[WKBElement] = mapped_column(
        Geography(geometry_type="LINESTRING", srid=4326),
        nullable=False,
    )


class DcPointOfInterest(Base):  # noqa: D401 — ORM table for bundled MAR alias names
    """Named-place alias row from the DC MAR "Points of Interest" layer.

    Denormalizes `label_full`/`lon`/`lat` from the matching `dc_addresses`
    row at ingest time (DEC-026) so search stays a plain per-row FTS/rank
    query with no runtime join.
    """

    __tablename__ = "dc_points_of_interest"

    id: Mapped[str] = mapped_column(Text, primary_key=True)
    mar_id: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    label_full: Mapped[str] = mapped_column(Text, nullable=False)
    label_normalized: Mapped[str] = mapped_column(Text, nullable=False)
    lon: Mapped[float] = mapped_column(Float, nullable=False)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    geom: Mapped[WKBElement] = mapped_column(
        Geography(geometry_type="POINT", srid=4326),
        nullable=False,
    )
