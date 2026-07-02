"""DC MAR "Points of Interest" alias snapshot table (DEC-026)."""

from __future__ import annotations

import sqlalchemy as sa
from geoalchemy2.types import Geography

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dc_points_of_interest",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("mar_id", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("label_full", sa.Text(), nullable=False),
        sa.Column("label_normalized", sa.Text(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column(
            "geom",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
    )
    op.create_index(
        "dc_points_of_interest_label_normalized_trgm_idx",
        "dc_points_of_interest",
        ["label_normalized"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"label_normalized": "gin_trgm_ops"},
    )
    op.create_index(
        "dc_points_of_interest_geom_idx",
        "dc_points_of_interest",
        ["geom"],
        unique=False,
        postgresql_using="gist",
    )
    op.create_index(
        "dc_points_of_interest_mar_id_idx",
        "dc_points_of_interest",
        ["mar_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "dc_points_of_interest_mar_id_idx", table_name="dc_points_of_interest"
    )
    op.drop_index("dc_points_of_interest_geom_idx", table_name="dc_points_of_interest")
    op.drop_index(
        "dc_points_of_interest_label_normalized_trgm_idx",
        table_name="dc_points_of_interest",
    )
    op.drop_table("dc_points_of_interest")
