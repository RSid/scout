"""Canonical `/api/categories` metadata."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

CategoryKind = Literal["obstacle", "aid"]

_CATEGORY_ROWS: tuple[tuple[str, str, str, CategoryKind, bool], ...] = (
    (
        "curb_ramps",
        "Curb ramps",
        "DC ADA curb ramps; obstacles when non-compliant or missing.",
        "obstacle",
        True,
    ),
    (
        "barriers",
        "Sidewalk barriers",
        "Trip hazards and missing sidewalk spans.",
        "obstacle",
        True,
    ),
    (
        "audible_signals",
        "Audible pedestrian signals",
        "Presence or absence of audible crossing signals.",
        "aid",
        True,
    ),
    (
        "bus_stops",
        "Accessible bus stops",
        "Metrobus ADA stop inventory (mostly M2).",
        "aid",
        False,
    ),
    (
        "restrooms",
        "Accessible restrooms",
        "Community restroom data layered from Refuge Restrooms.",
        "aid",
        True,
    ),
    (
        "rest_spots",
        "Rest / seating spots",
        "Benches mapped from auxiliary sources.",
        "aid",
        True,
    ),
    (
        "water_cooling",
        "Water / cooling spots",
        "Drinking fountains and related aids.",
        "aid",
        True,
    ),
    (
        "driveways",
        "Driveway crossings",
        "Minor curb transitions (opt-in category).",
        "obstacle",
        False,
    ),
    (
        "median_cut_throughs",
        "Median cut-throughs",
        "Pedestrian refuges crossing medians.",
        "aid",
        False,
    ),
)


def category_rows_to_dicts() -> list[dict[str, str | bool]]:
    return [
        {
            "id": row[0],
            "label": row[1],
            "description": row[2],
            "kind": row[3],
            "default_enabled": row[4],
        }
        for row in _CATEGORY_ROWS
    ]


@lru_cache(maxsize=1)
def frozen_category_manifest() -> tuple[dict[str, str | bool], ...]:
    return tuple(category_rows_to_dicts())


@lru_cache(maxsize=1)
def frozen_category_ids() -> frozenset[str]:
    return frozenset(row[0] for row in _CATEGORY_ROWS)


def unknown_corridor_categories(categories: tuple[str, ...]) -> tuple[str, ...]:
    """Return IDs not present in the canonical `/api/categories` manifest."""

    known = frozen_category_ids()
    unknown = tuple(sorted(c for c in categories if c not in known))
    return unknown
