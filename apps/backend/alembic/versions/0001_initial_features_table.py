"""Bootstrap normalized DC feature geometry storage."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from geoalchemy2.types import Geography
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(sa.text('CREATE EXTENSION IF NOT EXISTS postgis'))
    op.create_table(
        "features",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("kind", sa.Text(), nullable=False),
        sa.Column("condition", sa.Text(), nullable=True),
        sa.Column("condition_normalized", sa.Text(), nullable=False),
        sa.Column("inspected_year", sa.SmallInteger(), nullable=True),
        sa.Column("source_dataset", sa.Text(), nullable=False),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("attributes", JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column(
            "geom",
            Geography(geometry_type="POINT", srid=4326, spatial_index=False),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )

    op.create_index(
        "features_geom_idx",
        "features",
        ["geom"],
        unique=False,
        postgresql_using="gist",
    )
    op.create_index("features_category_idx", "features", ["category"], unique=False)
    op.create_index("features_source_idx", "features", ["source_dataset"], unique=False)


def downgrade() -> None:
    op.drop_index("features_source_idx", table_name="features")
    op.drop_index("features_category_idx", table_name="features")
    op.drop_index("features_geom_idx", table_name="features")
    op.drop_table("features")
