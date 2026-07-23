"""Aggregate UTM visit counts (privacy-first, no PII)."""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "utm_visits",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("medium", sa.Text(), nullable=False, server_default=""),
        sa.Column("campaign", sa.Text(), nullable=False, server_default=""),
        sa.Column("visited_date", sa.Date(), nullable=False),
        sa.Column(
            "hit_count", sa.Integer(), nullable=False, server_default=sa.text("1")
        ),
    )
    op.create_index(
        "utm_visits_lookup_idx",
        "utm_visits",
        ["source", "medium", "campaign", "visited_date"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("utm_visits_lookup_idx", table_name="utm_visits")
    op.drop_table("utm_visits")
