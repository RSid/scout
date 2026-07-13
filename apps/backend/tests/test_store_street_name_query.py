"""DB-free SQL-contract checks for the nearest-street-name KNN (DEC-027).

These compile the statements built by `nearest_street_name_select` and
`feature_street_name_update` to PostgreSQL text and assert their *shape*, so a
regression — dropping the `<->` KNN operator, losing the `LIMIT 1`, joining the
wrong table, or enriching restroom rows — surfaces in plain CI without a
database. The behaviour against real rows is covered by the gated PostGIS test.
"""

from __future__ import annotations

from sqlalchemy.dialects import postgresql

from scout.data.store import (
    feature_street_name_update,
    nearest_street_name_select,
)


def _compiled_select() -> str:
    stmt = nearest_street_name_select()
    return str(
        stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).lower()


def _compiled_update() -> str:
    stmt = feature_street_name_update()
    return str(
        stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).lower()


def test_select_uses_knn_distance_operator() -> None:
    assert "<->" in _compiled_select()


def test_select_reads_the_street_segments_table_with_a_single_nearest() -> None:
    sql = _compiled_select()
    assert "dc_street_segments" in sql
    assert "limit 1" in sql


def test_update_targets_features_street_name() -> None:
    sql = _compiled_update()
    assert sql.startswith("update features set street_name")


def test_update_skips_restroom_rows() -> None:
    # Restrooms come from Refuge, never PostGIS; the guard keeps them null.
    assert "refugerestrooms" in _compiled_update()
