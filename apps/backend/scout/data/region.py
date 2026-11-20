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

# Service area enforced on inbound route coordinates (`POST /api/route`
# endpoints and `POST /api/route-features` geometry): west, south, east, north
# (degrees). A hair looser than `DC_BBOX_LON_LAT` so addresses on the District
# line are never rejected.
DC_SERVICE_AREA_LON_LAT: tuple[float, float, float, float] = (
    -77.12,
    38.79,
    -76.91,
    39.0,
)


def in_dc_service_area(lon: float, lat: float, *, margin_degrees: float = 0.0) -> bool:
    """True when (lon, lat) lies inside the DC service area grown by a margin."""

    west, south, east, north = DC_SERVICE_AREA_LON_LAT
    return (
        west - margin_degrees <= lon <= east + margin_degrees
        and south - margin_degrees <= lat <= north + margin_degrees
    )
