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
