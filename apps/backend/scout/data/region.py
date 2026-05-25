"""Product geography constants (M1).

M1 scopes routing and autocomplete to Washington, DC. Imports this module
for bbox checks (e.g. reverse geocoding outside the District).
"""

from __future__ import annotations

# Approximate bounding box around DC: west, south, east, north (degrees).
DC_BBOX_LON_LAT: tuple[float, float, float, float] = (
    -77.119,
    38.792,
    -76.909,
    38.996,
)
