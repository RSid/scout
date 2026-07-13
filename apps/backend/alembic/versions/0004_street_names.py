"""Street names: features.street_name + dc_street_segments table (M2-F24, DEC-027)."""

from __future__ import annotations

import sqlalchemy as sa
from geoalchemy2.types import Geography

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "features",
        sa.Column("street_name", sa.Text(), nullable=True),
    )
    op.create_table(
        "dc_street_segments",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column(
            "geom",
            Geography(geometry_type="LINESTRING", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )
    op.create_index(
        "dc_street_segments_geom_idx",
        "dc_street_segments",
        ["geom"],
        unique=False,
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_index("dc_street_segments_geom_idx", table_name="dc_street_segments")
    op.drop_table("dc_street_segments")
    op.drop_column("features", "street_name")
