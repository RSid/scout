"""Scout-domain types crossing the restrooms adapter boundary (DEC-020).

Vendor (Refuge) wire shapes are translated into these types inside the
adapter; call sites never see Refuge JSON.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class Bbox(BaseModel):
    """A west/south/east/north lon-lat bounding box."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    west: float
    south: float
    east: float
    north: float

    def contains(self, lon: float, lat: float) -> bool:
        """True when ``(lon, lat)`` falls inside the box (edges inclusive)."""

        return self.west <= lon <= self.east and self.south <= lat <= self.north


class Restroom(BaseModel):
    """One ADA-accessible restroom in Scout-domain terms."""

    model_config = ConfigDict(extra="forbid", frozen=True, strict=True)

    api_id: str
    name: str | None
    street: str | None
    city: str | None
    state: str | None
    accessible: bool
    unisex: bool
    changing_table: bool
    directions: str | None
    comment: str | None
    lat: float
    lng: float
    updated_at: str | None
