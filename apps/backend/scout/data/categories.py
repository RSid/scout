"""Canonical `/api/categories` metadata."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

CategoryKind = Literal["obstacle", "aid"]

_CATEGORY_ROWS: tuple[tuple[str, str, str, CategoryKind, bool], ...] = (
    (
        "curb_ramps",
        "Curb ramps",
        "ADA curb ramps; obstacles when non-compliant or missing.",
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
        "Audible crossing signals.",
        "aid",
        True,
    ),
    (
        "bus_stops",
        "Accessible bus stops",
        "Metrobus ADA bus stops.",
        "aid",
        False,
    ),
    (
        "restrooms",
        "Accessible restrooms",
        "Community-sourced restroom data.",
        "aid",
        True,
    ),
    (
        "rest_spots",
        "Rest / seating spots",
        "Benches or places to sit.",
        "aid",
        True,
    ),
    (
        "water_cooling",
        "Water / cooling spots",
        "Drinking fountains and similar.",
        "aid",
        True,
    ),
    (
        "driveways",
        "Driveway crossings",
        "Minor curb transitions.",
        "obstacle",
        False,
    ),
    (
        "median_cut_throughs",
        "Median cut-throughs",
        "Pedestrian paths for crossing medians.",
        "aid",
        False,
    ),
    (
        "sidewalk_condition",
        "Sidewalk condition assessments",
        "Sidewalk Condition Assessment",
        "obstacle",  # degraded segments = obstacles for pedestrians
        False,  # opt-in by default
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
