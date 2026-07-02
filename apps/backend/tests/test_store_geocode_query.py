"""DB-free SQL-contract checks for the blended geocoder query (DEC-026).

These compile the statement built by `search_dc_addresses_select` to
PostgreSQL text and assert its *shape*, so a regression — dropping the
`UNION ALL`, losing one source table, or reverting to `dc_addresses`-only
ranking — surfaces in plain CI without a database.
"""

from __future__ import annotations

from sqlalchemy.dialects import postgresql

from scout.data.store import search_dc_addresses_select


def _compiled(query: str, *, limit: int = 5) -> str:
    stmt = search_dc_addresses_select(query, limit=limit)
    assert stmt is not None
    return str(
        stmt.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    ).lower()


def test_geocode_query_unions_addresses_and_points_of_interest() -> None:
    sql = _compiled("national building")
    assert "union all" in sql
    assert "dc_addresses" in sql
    assert "dc_points_of_interest" in sql
    assert sql.count("ts_rank_cd") == 2


def test_geocode_query_orders_by_rank_then_label_length() -> None:
    sql = _compiled("national building")
    order_by = sql.split("order by", 1)[1]
    assert "rank desc" in order_by
    assert "label_len asc" in order_by


def test_geocode_query_caps_the_unioned_result() -> None:
    assert "limit 5" in _compiled("national building", limit=5)
    # Over-large limits are capped, not passed through verbatim.
    assert "limit 25" in _compiled("national building", limit=999)


def test_geocode_query_returns_none_for_empty_query() -> None:
    assert search_dc_addresses_select("   ", limit=5) is None
    assert search_dc_addresses_select("!!!", limit=5) is None


def test_geocode_query_reuses_one_bound_value_for_both_subqueries() -> None:
    # Both the dc_addresses and dc_points_of_interest halves must search for
    # the exact same normalized/prefix-tsquery string — this is what makes
    # `AddressAutocomplete`'s single query box search both sources at once.
    sql = _compiled("4818 ka")
    assert sql.count("'4818:* & ka:*'") == 4  # match + rank, x2 tables
