"""DB-free SQL-contract checks for the corridor page query (M1-F07 S2/S3).

These compile the statement built by `corridor_features_select` to PostgreSQL
text and assert its *shape*, so a regression — dropping the buffer filter,
ordering by `ST_Distance` from the start instead of `ST_LineLocatePoint`, or
losing the category allow-list — surfaces in plain CI without a database. The
behaviour against real rows is covered by the gated PostGIS test in
`test_corridor_postgis.py`.
"""

from __future__ import annotations

from sqlalchemy.dialects import postgresql

from scout.data.store import corridor_features_select

_LINE = [[-77.05, 38.90], [-77.00, 38.95]]


def _compiled(limit: int = 500) -> str:
    stmt = corridor_features_select(
        _LINE, ["curb_ramps", "restrooms"], 30.0, limit=limit
    )
    return str(
        stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).lower()


def test_corridor_query_buffers_with_st_dwithin() -> None:
    assert "st_dwithin" in _compiled()


def test_corridor_query_orders_by_line_locate_point_not_distance() -> None:
    # The along-route fraction is computed with ST_LineLocatePoint and the
    # ORDER BY sorts on that labelled column; ST_Distance (distance-from-start)
    # must never appear — that was the rejected approach in M1-F07 S3.
    sql = _compiled()
    assert "st_linelocatepoint" in sql
    assert "st_distance" not in sql
    assert "along_route" in sql.split("order by", 1)[1]


def test_corridor_query_filters_to_the_enabled_categories() -> None:
    sql = _compiled()
    assert "'curb_ramps'" in sql and "'restrooms'" in sql


def test_corridor_query_fetches_one_past_the_cap_to_detect_truncation() -> None:
    # limit + 1 is the "is there a 501st row?" probe behind metadata.truncated.
    assert "limit 501" in _compiled(limit=500)
