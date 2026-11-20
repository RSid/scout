"""ORS adapter + `/api/route` behavior while backing off from quota errors (M1-F04).

Upstream HTTP is faked with respx, so these tests never reach ORS.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Iterator

import httpx
import pytest
import respx  # MOCK: fakes ORS HTTPS responses so no test spends real quota.
from starlette.testclient import TestClient

from scout.clients.routing.cooldown import RoutingCooldown
from scout.clients.routing.openrouteservice import OpenRouteServiceProvider
from scout.config import Settings
from scout.errors import (
    ROUTE_SERVICE_BUSY_USER_MESSAGE,
    RouteNotFoundError,
    RouteServiceBusyError,
    RouteServiceUnavailableError,
)
from scout.main import create_app

ORS_BASE = "https://api.heigit.org/openrouteservice"
WHEELCHAIR_URL = f"{ORS_BASE}/v2/directions/wheelchair/geojson"
FOOT_URL = f"{ORS_BASE}/v2/directions/foot-walking/geojson"
FROM = [-77.0, 38.9]
TO = [-76.92, 38.92]
NOW = 1_800_000_000.0

ORS_SUCCESS_BODY = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "geometry": {"coordinates": [FROM, TO], "type": "LineString"},
            "properties": {"summary": {"distance": 829.0, "duration": 565.4}},
        }
    ],
}

ORS_ERROR = {"error": {"code": 2099, "message": "Unknown internal error."}}

SETTINGS = Settings(
    database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
    routing_provider="openrouteservice",
    ors_api_key="unit-test-token",
    ors_base_url=ORS_BASE,
    cors_allowlist_csv="",
)


class FakeClock:
    """Owned test double for the injected clock; advanced by hand."""

    def __init__(self) -> None:
        self.current = NOW

    def __call__(self) -> float:
        return self.current


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
async def adapter(clock: FakeClock) -> AsyncIterator[OpenRouteServiceProvider]:
    async with httpx.AsyncClient() as client:
        yield OpenRouteServiceProvider(
            settings=SETTINGS,
            client=client,
            cooldown=RoutingCooldown(clock=clock),
        )


async def _route(adapter: OpenRouteServiceProvider) -> None:
    await adapter.walking_route(FROM, TO, profile="wheelchair")


async def _route_ignoring_busy(adapter: OpenRouteServiceProvider) -> None:
    try:
        await _route(adapter)
    except RouteServiceBusyError:
        pass


QUOTA_RESPONSES = [
    pytest.param(httpx.Response(429), id="per-minute-429"),
    pytest.param(
        httpx.Response(403, headers={"x-ratelimit-remaining": "0"}),
        id="daily-403",
    ),
]


@pytest.mark.parametrize("quota_response", QUOTA_RESPONSES)
@respx.mock
async def test_quota_error_raises_route_service_busy(
    adapter: OpenRouteServiceProvider, quota_response: httpx.Response
) -> None:
    respx.post(WHEELCHAIR_URL).mock(return_value=quota_response)

    with pytest.raises(RouteServiceBusyError):
        await _route(adapter)


@pytest.mark.parametrize("quota_response", QUOTA_RESPONSES)
@respx.mock
async def test_quota_error_on_wheelchair_skips_foot_walking(
    adapter: OpenRouteServiceProvider, quota_response: httpx.Response
) -> None:
    respx.post(WHEELCHAIR_URL).mock(return_value=quota_response)
    foot = respx.post(FOOT_URL).respond(200, json=ORS_SUCCESS_BODY)

    await _route_ignoring_busy(adapter)

    assert foot.call_count == 0


@respx.mock
async def test_quota_error_on_foot_walking_fallback_opens_cooldown(
    adapter: OpenRouteServiceProvider,
) -> None:
    respx.post(WHEELCHAIR_URL).respond(404)
    respx.post(FOOT_URL).respond(429)

    await _route_ignoring_busy(adapter)

    with pytest.raises(RouteServiceBusyError):
        await _route(adapter)


@respx.mock
async def test_retry_after_on_429_sets_busy_retry_after(
    adapter: OpenRouteServiceProvider,
) -> None:
    respx.post(WHEELCHAIR_URL).respond(429, headers={"Retry-After": "42"})

    with pytest.raises(RouteServiceBusyError) as caught:
        await _route(adapter)

    assert caught.value.retry_after_seconds == 42


@respx.mock
async def test_ratelimit_reset_on_daily_403_sets_busy_retry_after(
    adapter: OpenRouteServiceProvider,
) -> None:
    reset_at = str(int(NOW) + 5400)
    respx.post(WHEELCHAIR_URL).respond(
        403, headers={"x-ratelimit-remaining": "0", "x-ratelimit-reset": reset_at}
    )

    with pytest.raises(RouteServiceBusyError) as caught:
        await _route(adapter)

    assert caught.value.retry_after_seconds == 5400


@respx.mock
async def test_requests_during_cooldown_do_not_call_upstream(
    adapter: OpenRouteServiceProvider, clock: FakeClock
) -> None:
    upstream = respx.post(WHEELCHAIR_URL).respond(429)
    await _route_ignoring_busy(adapter)
    clock.current += 30.0

    await _route_ignoring_busy(adapter)
    await _route_ignoring_busy(adapter)

    assert upstream.call_count == 1


@respx.mock
async def test_request_during_cooldown_reports_remaining_seconds(
    adapter: OpenRouteServiceProvider, clock: FakeClock
) -> None:
    respx.post(WHEELCHAIR_URL).respond(429)
    await _route_ignoring_busy(adapter)
    clock.current += 45.0

    with pytest.raises(RouteServiceBusyError) as caught:
        await _route(adapter)

    assert caught.value.retry_after_seconds == 15


@respx.mock
async def test_cooldown_expiry_calls_upstream_again(
    adapter: OpenRouteServiceProvider, clock: FakeClock
) -> None:
    respx.post(WHEELCHAIR_URL).mock(
        side_effect=[httpx.Response(429), httpx.Response(200, json=ORS_SUCCESS_BODY)]
    )
    await _route_ignoring_busy(adapter)
    clock.current += 60.0

    result = await adapter.walking_route(FROM, TO, profile="wheelchair")

    assert result.distance_meters == pytest.approx(829.0)


@respx.mock
async def test_quota_error_is_not_cached(
    adapter: OpenRouteServiceProvider, clock: FakeClock
) -> None:
    upstream = respx.post(WHEELCHAIR_URL).mock(
        side_effect=[httpx.Response(429), httpx.Response(200, json=ORS_SUCCESS_BODY)]
    )
    await _route_ignoring_busy(adapter)
    clock.current += 60.0

    await _route(adapter)

    assert upstream.call_count == 2


@respx.mock
async def test_cached_route_still_served_during_cooldown(
    adapter: OpenRouteServiceProvider,
) -> None:
    respx.post(WHEELCHAIR_URL).mock(
        side_effect=[httpx.Response(200, json=ORS_SUCCESS_BODY), httpx.Response(429)]
    )
    await _route(adapter)  # warms the cache for FROM -> TO
    try:
        await adapter.walking_route(FROM, [-77.03, 38.95], profile="wheelchair")
    except RouteServiceBusyError:
        pass  # a different trip hits the 429 and opens the cooldown

    result = await adapter.walking_route(FROM, TO, profile="wheelchair")

    assert result.distance_meters == pytest.approx(829.0)


@pytest.mark.parametrize(
    ("status_code", "headers", "expected_error"),
    [
        (403, {}, RouteServiceUnavailableError),
        (403, {"x-ratelimit-remaining": "17"}, RouteServiceUnavailableError),
        (401, {}, RouteServiceUnavailableError),
        (500, {}, RouteServiceUnavailableError),
        (503, {"Retry-After": "120"}, RouteServiceUnavailableError),
    ],
)
@respx.mock
async def test_non_quota_errors_keep_their_mapping(
    adapter: OpenRouteServiceProvider,
    status_code: int,
    headers: dict[str, str],
    expected_error: type[Exception],
) -> None:
    # A body matters: the adapter treats an empty response as "no route".
    respx.post(WHEELCHAIR_URL).respond(status_code, headers=headers, json=ORS_ERROR)

    with pytest.raises(expected_error) as caught:
        await _route(adapter)

    assert not isinstance(caught.value, RouteServiceBusyError)


@pytest.mark.parametrize("status_code", [403, 401, 500])
@respx.mock
async def test_non_quota_errors_do_not_open_cooldown(
    adapter: OpenRouteServiceProvider, status_code: int
) -> None:
    upstream = respx.post(WHEELCHAIR_URL).respond(status_code, json=ORS_ERROR)
    with pytest.raises(RouteServiceUnavailableError):
        await _route(adapter)

    with pytest.raises(RouteServiceUnavailableError):
        await _route(adapter)

    assert upstream.call_count == 2


@respx.mock
async def test_not_found_on_both_profiles_does_not_open_cooldown(
    adapter: OpenRouteServiceProvider,
) -> None:
    respx.post(WHEELCHAIR_URL).respond(404)
    foot = respx.post(FOOT_URL).respond(404)
    with pytest.raises(RouteNotFoundError):
        await _route(adapter)

    with pytest.raises(RouteNotFoundError):
        await _route(adapter)

    assert foot.call_count == 2


@respx.mock
async def test_success_path_makes_one_upstream_call(
    adapter: OpenRouteServiceProvider,
) -> None:
    upstream = respx.post(WHEELCHAIR_URL).respond(200, json=ORS_SUCCESS_BODY)

    result = await adapter.walking_route(FROM, TO, profile="wheelchair")

    assert (upstream.call_count, result.fallback_profile_used) == (1, False)


ROUTE_PAYLOAD = {"from": FROM, "to": TO, "profile": "wheelchair"}


@pytest.fixture
def ors_app_client() -> Iterator[TestClient]:
    """App wired to the real ORS adapter; per-IP limits off so they don't interfere."""

    settings = SETTINGS.model_copy(update={"rate_limit_enabled": False})
    with TestClient(create_app(settings)) as client:
        yield client


@respx.mock
def test_route_endpoint_maps_quota_error_to_busy_envelope(
    ors_app_client: TestClient,
) -> None:
    respx.post(WHEELCHAIR_URL).respond(429, headers={"Retry-After": "30"})

    resp = ors_app_client.post("/api/route", json=ROUTE_PAYLOAD)

    assert (resp.status_code, resp.headers.get("retry-after"), resp.json()) == (
        503,
        "30",
        {
            "error": {
                "code": "ROUTE_SERVICE_BUSY",
                "message": ROUTE_SERVICE_BUSY_USER_MESSAGE,
            }
        },
    )


@respx.mock
def test_route_endpoint_during_cooldown_returns_503_without_upstream_call(
    ors_app_client: TestClient,
) -> None:
    upstream = respx.post(WHEELCHAIR_URL).respond(429)
    ors_app_client.post("/api/route", json=ROUTE_PAYLOAD)

    resp = ors_app_client.post("/api/route", json=ROUTE_PAYLOAD)

    assert (resp.status_code, upstream.call_count) == (503, 1)


@respx.mock
def test_route_endpoint_busy_response_always_has_retry_after(
    ors_app_client: TestClient,
) -> None:
    respx.post(WHEELCHAIR_URL).respond(429)
    ors_app_client.post("/api/route", json=ROUTE_PAYLOAD)

    resp = ors_app_client.post("/api/route", json=ROUTE_PAYLOAD)

    assert 1 <= int(resp.headers["retry-after"]) <= 60
