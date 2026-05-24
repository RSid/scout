"""Expose concrete adapter constructors (DEC-020 entrypoint).

The factory functions below are the *only* place that imports a concrete
vendor adapter. Application code consumes the Protocol type and lets the
factory pick the impl based on a single env var per concern.
"""

from __future__ import annotations

import httpx

from scout.clients.geocoding.photon import PhotonProvider
from scout.clients.geocoding.protocol import GeocodingProvider
from scout.clients.geocoding.stub import StubGeocodingProvider
from scout.clients.restrooms.protocol import RestroomsProvider
from scout.clients.restrooms.refuge import RefugeRestroomsProvider
from scout.clients.restrooms.stub import StubRestroomsProvider
from scout.clients.routing.openrouteservice import OpenRouteServiceProvider
from scout.clients.routing.protocol import RoutingProvider
from scout.clients.routing.stub import StubRoutingProvider
from scout.config import Settings


def get_routing_provider(
    settings: Settings, client: httpx.AsyncClient
) -> RoutingProvider:
    if settings.routing_provider.lower() == "stub":
        return StubRoutingProvider()
    return OpenRouteServiceProvider(settings=settings, client=client)


def get_geocoding_provider(
    settings: Settings, client: httpx.AsyncClient
) -> GeocodingProvider:
    if settings.geocoding_provider.lower() == "stub":
        return StubGeocodingProvider()
    return PhotonProvider(settings=settings, client=client)


def get_restrooms_provider(
    settings: Settings, client: httpx.AsyncClient
) -> RestroomsProvider:
    if settings.restrooms_provider.lower() == "stub":
        return StubRestroomsProvider()
    return RefugeRestroomsProvider(settings=settings, client=client)
