"""In-memory route cache for the ORS adapter (M1-F04)."""

from __future__ import annotations

from collections import OrderedDict
from time import monotonic

RoutingCacheKey = tuple[str | int, ...]


def routing_cache_key(profile: str, pairs: list[float]) -> RoutingCacheKey:
    """Cache key: request profile plus four-decimal rounded lon/lat pairs."""

    token = profile.strip().lower()
    coords = tuple(int(round(coord * 10_000)) for coord in pairs)
    return (token,) + coords


class TTLCache[R]:
    """256-entry LRU with 24-hour expiry (M1-F04 scaffolding)."""

    def __init__(self, *, maxlen: int = 256, ttl_seconds: float = 86400.0) -> None:
        self.maxlen = maxlen
        self.ttl_seconds = ttl_seconds
        self._store: OrderedDict[RoutingCacheKey, tuple[float, R]] = OrderedDict()

    def get(self, key: RoutingCacheKey) -> R | None:
        now = monotonic()
        if key not in self._store:
            return None
        stamp, payload = self._store[key]
        if now - stamp > self.ttl_seconds:
            del self._store[key]
            return None
        self._store.move_to_end(key)
        return payload

    def set(self, key: RoutingCacheKey, payload: R) -> None:
        now = monotonic()
        self._store[key] = (now, payload)
        self._store.move_to_end(key)
        while len(self._store) > self.maxlen:
            self._store.popitem(last=False)
