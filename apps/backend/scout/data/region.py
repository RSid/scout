"""Product geography constants (DEC-022, M1).

M1 scopes routing and autocomplete to Washington, DC. Geocoding adapters
that support a bounded search (e.g. Photon `bbox`) import these numbers
here and translate them to their upstream wire shape at the boundary.
"""

from __future__ import annotations

# Approximate bounding box around DC: west, south, east, north (degrees).
DC_BBOX_LON_LAT: tuple[float, float, float, float] = (
    -77.119,
    38.792,
    -76.909,
    38.996,
)
