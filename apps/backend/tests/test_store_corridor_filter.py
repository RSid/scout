"""Unit checks for `_renderable_corridor_filter` (corridor SQL where-clause).

The full SQL behaviour is exercised by the optional integration test in
`test_route_features.py::test_route_features_live_postgis_smoke` (gated by
`SCOUT_RUN_PG_TESTS=1` against a seeded PostGIS DB). These tests verify the
*shape* of the predicate so a future regression — say, accidentally inverting
the NOT, or dropping a condition — surfaces in plain CI without a database.
"""

from __future__ import annotations

from sqlalchemy.dialects import postgresql

from scout.data.store import (
    _NON_RENDERABLE_CORRIDOR_PAIRS,
    _renderable_corridor_filter,
)


def _compiled_sql() -> str:
    clause = _renderable_corridor_filter()
    return str(
        clause.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )


def test_filter_excludes_audible_signals_absent_and_n_a() -> None:
    """`audible_signals` rows with absent/n_a conditions are excluded."""
    sql = _compiled_sql().lower()
    assert "audible_signals" in sql
    assert "'absent'" in sql
    assert "'n_a'" in sql


def test_filter_wraps_excluded_buckets_in_not() -> None:
    """The clause is a NOT() so other rows pass through unchanged."""
    sql = _compiled_sql().lower()
    assert sql.startswith("not ") or sql.lstrip("(").startswith("not ")


def test_constant_pairs_only_lists_audible_signals_today() -> None:
    """Lock the current contract: only audible_signals has unrenderable rows.

    If a follow-up change adds another category to the table, update this
    assertion alongside the schema doc so reviewers see the scope expanding.
    """
    assert _NON_RENDERABLE_CORRIDOR_PAIRS == (("audible_signals", ("absent", "n_a")),)
