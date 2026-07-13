"""GIN full-text-search indexes for geocode autocomplete.

The existing trigram indexes (`gin_trgm_ops`) accelerate LIKE/ILIKE but do NOT
cover ``to_tsvector @@ to_tsquery`` used by the geocode search path.  Without
these indexes every keystroke triggers a sequential scan with per-row
``to_tsvector`` computation.
"""

from __future__ import annotations

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "CREATE INDEX IF NOT EXISTS dc_addresses_label_fts_idx "
        "ON dc_addresses USING gin (to_tsvector('simple', label_normalized))"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS dc_points_of_interest_label_fts_idx "
        "ON dc_points_of_interest USING gin (to_tsvector('simple', label_normalized))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS dc_points_of_interest_label_fts_idx")
    op.execute("DROP INDEX IF EXISTS dc_addresses_label_fts_idx")
