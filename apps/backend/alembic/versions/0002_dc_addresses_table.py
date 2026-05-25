"""DC Master Address Repository snapshot table (M1-F03, DEC-023 follow-up)."""

from __future__ import annotations

import sqlalchemy as sa
from geoalchemy2.types import Geography

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))
    op.create_table(
        "dc_addresses",
        sa.Column("id", sa.Text(), primary_key=True),
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
        "dc_addresses_label_normalized_trgm_idx",
        "dc_addresses",
        ["label_normalized"],
        unique=False,
        postgresql_using="gin",
        postgresql_ops={"label_normalized": "gin_trgm_ops"},
    )
    op.create_index(
        "dc_addresses_geom_idx",
        "dc_addresses",
        ["geom"],
        unique=False,
        postgresql_using="gist",
    )


def downgrade() -> None:
    op.drop_index("dc_addresses_geom_idx", table_name="dc_addresses")
    op.drop_index("dc_addresses_label_normalized_trgm_idx", table_name="dc_addresses")
    op.drop_table("dc_addresses")
