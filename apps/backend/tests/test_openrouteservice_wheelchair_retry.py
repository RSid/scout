"""ORS adapter: wheelchair defaults and the step-only-endpoint retry (M1-F04).

Upstream HTTP is faked with respx, so these tests never reach ORS.
"""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Iterator
from typing import Any

import httpx
import pytest
import respx  # MOCK: fakes ORS HTTPS responses so no test spends real quota.
from starlette.testclient import TestClient

from scout.clients.routing.constants import FALLBACK_PROFILE_WARNING
from scout.clients.routing.cooldown import (
    CooldownDecision,
    QuotaSignal,
    RoutingCooldown,
)
from scout.clients.routing.openrouteservice import OpenRouteServiceProvider
from scout.clients.routing.types import RoutingComputation
from scout.config import Settings
from scout.errors import RouteServiceBusyError
from scout.main import create_app
from tests.routing_fixtures import foot_body, north_of_origin, ors_body

ORS_BASE = "https://api.heigit.org/openrouteservice"
WHEELCHAIR_URL = f"{ORS_BASE}/v2/directions/wheelchair/geojson"
FOOT_URL = f"{ORS_BASE}/v2/directions/foot-walking/geojson"
FROM = north_of_origin(-15.0)
TO = north_of_origin(1015.0)
NOW = 1_800_000_000.0

SETTINGS = Settings(
    database_url="postgresql+asyncpg://scout:scout@localhost:5444/pytest-db",
    routing_provider="openrouteservice",
    ors_api_key="unit-test-token",
    ors_base_url=ORS_BASE,
    cors_allowlist_csv="",
)

DOCUMENTED_WHEELCHAIR_OPTIONS = {
    "profile_params": {
        "restrictions": {
            "maximum_incline": 6,
            "maximum_sloped_kerb": 0.06,
            "smoothness_type": "good",
            "surface_type": "cobblestone:flattened",
            "track_type": "grade1",
        }
    }
}

ROUTE_NOT_FOUND = httpx.Response(
    404, json={"error": {"code": 2009, "message": "Route could not be found."}}
)
# 1000 m foot route; steps at vertices 3-5 (30-50 m) and 95-97 (950-970 m).
FOOT_STEPS_BOTH_ENDS = foot_body(1000.0, step_vertex_ranges=[(3, 5), (95, 97)])
WHEELCHAIR_LEG_COORDS = [north_of_origin(72.0), north_of_origin(948.0)]
WHEELCHAIR_LEG = ors_body(WHEELCHAIR_LEG_COORDS, distance=880.0, duration=640.0)


class FakeClock:
    """Owned test double for the injected clock."""

    def __call__(self) -> float:
        return NOW


@pytest.fixture
def cooldown() -> RoutingCooldown:
    return RoutingCooldown(clock=FakeClock())


@pytest.fixture
async def adapter(
    cooldown: RoutingCooldown,
) -> AsyncIterator[OpenRouteServiceProvider]:
    async with httpx.AsyncClient() as client:
        yield OpenRouteServiceProvider(
            settings=SETTINGS, client=client, cooldown=cooldown
        )


async def _route(adapter: OpenRouteServiceProvider) -> RoutingComputation:
    return await adapter.walking_route(FROM, TO, profile="wheelchair")


def _sent_json(route: respx.Route, call_index: int = 0) -> dict[str, Any]:
    payload: dict[str, Any] = json.loads(route.calls[call_index].request.content)
    return payload


def _mock_retry_scenario(
    foot: dict[str, Any], retry: httpx.Response
) -> tuple[respx.Route, respx.Route]:
    wheelchair = respx.post(WHEELCHAIR_URL).mock(side_effect=[ROUTE_NOT_FOUND, retry])
    foot_route = respx.post(FOOT_URL).respond(200, json=foot)
    return wheelchair, foot_route


# --- documented wheelchair defaults -------------------------------------


@respx.mock
async def test_wheelchair_request_sends_documented_default_restrictions(
    adapter: OpenRouteServiceProvider,
) -> None:
    wheelchair = respx.post(WHEELCHAIR_URL).respond(200, json=WHEELCHAIR_LEG)

    await _route(adapter)

    assert _sent_json(wheelchair)["options"] == DOCUMENTED_WHEELCHAIR_OPTIONS


@respx.mock
async def test_wheelchair_retry_also_sends_default_restrictions(
    adapter: OpenRouteServiceProvider,
) -> None:
    wheelchair, _ = _mock_retry_scenario(
        FOOT_STEPS_BOTH_ENDS, httpx.Response(200, json=WHEELCHAIR_LEG)
    )

    await _route(adapter)

    assert _sent_json(wheelchair, 1)["options"] == DOCUMENTED_WHEELCHAIR_OPTIONS


@respx.mock
async def test_foot_walking_request_omits_wheelchair_restrictions(
    adapter: OpenRouteServiceProvider,
) -> None:
    _, foot = _mock_retry_scenario(FOOT_STEPS_BOTH_ENDS, ROUTE_NOT_FOUND)

    await _route(adapter)

    assert "options" not in _sent_json(foot)


@respx.mock
async def test_foot_walking_request_asks_for_waytype(
    adapter: OpenRouteServiceProvider,
) -> None:
    _, foot = _mock_retry_scenario(FOOT_STEPS_BOTH_ENDS, ROUTE_NOT_FOUND)

    await _route(adapter)

    assert _sent_json(foot)["extra_info"] == ["waytype"]


# --- retry succeeds -----------------------------------------------------


@pytest.fixture
async def retried(adapter: OpenRouteServiceProvider) -> RoutingComputation:
    with respx.mock:
        _mock_retry_scenario(
            FOOT_STEPS_BOTH_ENDS, httpx.Response(200, json=WHEELCHAIR_LEG)
        )
        return await _route(adapter)


def test_retry_success_is_not_a_fallback(retried: RoutingComputation) -> None:
    assert (retried.fallback_profile_used, retried.warnings) == (False, ())


def test_retry_success_sums_distance(retried: RoutingComputation) -> None:
    # Stretches: 50 m + 20 m clearance at each end.
    assert retried.distance_meters == pytest.approx(880.0 + 70.0 + 70.0, abs=0.1)


def test_retry_success_sums_duration(retried: RoutingComputation) -> None:
    # Foot pace from the fixture is 0.72 s/m.
    assert retried.duration_seconds == pytest.approx(640.0 + 140.0 * 0.72, abs=0.1)


def test_retry_success_geometry_joins_foot_stretches_and_leg(
    retried: RoutingComputation,
) -> None:
    coords = retried.geojson_fc["features"][0]["geometry"]["coordinates"]
    foot_coords = FOOT_STEPS_BOTH_ENDS["features"][0]["geometry"]["coordinates"]

    assert (coords[0], coords[-1], WHEELCHAIR_LEG_COORDS[0] in coords) == (
        foot_coords[0],
        foot_coords[-1],
        True,
    )


def test_retry_success_reports_unverified_segments(
    retried: RoutingComputation,
) -> None:
    assert [
        (s.position, s.length_meters, s.reason) for s in retried.unverified_segments
    ] == [
        ("start", pytest.approx(70.0, abs=0.1), "endpoint_steps_only"),
        ("end", pytest.approx(70.0, abs=0.1), "endpoint_steps_only"),
    ]


@pytest.mark.parametrize(
    ("step_vertex_ranges", "expected_start_m", "expected_end_m"),
    [
        pytest.param([(3, 5)], 70.0, 1000.0, id="steps-near-start-only"),
        pytest.param([(95, 97)], 0.0, 930.0, id="steps-near-end-only"),
        pytest.param([(3, 5), (95, 97)], 70.0, 930.0, id="steps-near-both"),
        pytest.param([], 100.0, 900.0, id="no-steps-moves-both-100m"),
    ],
)
@respx.mock
async def test_retry_requests_route_between_nudged_points(
    adapter: OpenRouteServiceProvider,
    step_vertex_ranges: list[tuple[int, int]],
    expected_start_m: float,
    expected_end_m: float,
) -> None:
    wheelchair, _ = _mock_retry_scenario(
        foot_body(1000.0, step_vertex_ranges=step_vertex_ranges),
        httpx.Response(200, json=WHEELCHAIR_LEG),
    )

    await _route(adapter)

    assert _sent_json(wheelchair, 1)["coordinates"] == [
        pytest.approx(north_of_origin(expected_start_m), abs=1e-6),
        pytest.approx(north_of_origin(expected_end_m), abs=1e-6),
    ]


@respx.mock
async def test_retry_success_is_cached(adapter: OpenRouteServiceProvider) -> None:
    wheelchair, foot = _mock_retry_scenario(
        FOOT_STEPS_BOTH_ENDS, httpx.Response(200, json=WHEELCHAIR_LEG)
    )
    first = await _route(adapter)

    second = await _route(adapter)

    assert (second, wheelchair.call_count, foot.call_count) == (first, 2, 1)


# --- retry not attempted or fails: plain foot-walking fallback ----------


def _is_plain_foot_fallback(result: RoutingComputation) -> bool:
    return (
        result.fallback_profile_used
        and result.warnings == (FALLBACK_PROFILE_WARNING,)
        and result.unverified_segments == ()
        and result.distance_meters == 1000.0
    )


@pytest.mark.parametrize(
    "retry_response",
    [
        pytest.param(ROUTE_NOT_FOUND, id="route-not-found-again"),
        pytest.param(httpx.Response(500, json={"error": "boom"}), id="server-error"),
        pytest.param(httpx.Response(401, json={"error": "nope"}), id="credentials"),
        pytest.param(httpx.Response(429), id="per-minute-quota"),
        pytest.param(
            httpx.Response(403, headers={"x-ratelimit-remaining": "0"}),
            id="daily-quota",
        ),
    ],
)
@respx.mock
async def test_failed_retry_returns_foot_walking_fallback(
    adapter: OpenRouteServiceProvider, retry_response: httpx.Response
) -> None:
    _mock_retry_scenario(FOOT_STEPS_BOTH_ENDS, retry_response)

    assert _is_plain_foot_fallback(await _route(adapter))


@respx.mock
async def test_failed_retry_fallback_omits_ors_extras(
    adapter: OpenRouteServiceProvider,
) -> None:
    _mock_retry_scenario(FOOT_STEPS_BOTH_ENDS, ROUTE_NOT_FOUND)

    result = await _route(adapter)

    assert "extras" not in result.geojson_fc["features"][0]["properties"]


@respx.mock
async def test_quota_error_on_retry_opens_cooldown(
    adapter: OpenRouteServiceProvider,
) -> None:
    _mock_retry_scenario(FOOT_STEPS_BOTH_ENDS, httpx.Response(429))
    await _route(adapter)

    with pytest.raises(RouteServiceBusyError):
        await adapter.walking_route(FROM, north_of_origin(2000.0), profile="wheelchair")


@respx.mock
async def test_wheelchair_is_retried_at_most_once(
    adapter: OpenRouteServiceProvider,
) -> None:
    wheelchair = respx.post(WHEELCHAIR_URL).mock(return_value=ROUTE_NOT_FOUND)
    respx.post(FOOT_URL).respond(200, json=FOOT_STEPS_BOTH_ENDS)

    await _route(adapter)

    assert wheelchair.call_count == 2


@respx.mock
async def test_failed_retry_fallback_is_cached(
    adapter: OpenRouteServiceProvider,
) -> None:
    wheelchair, _ = _mock_retry_scenario(FOOT_STEPS_BOTH_ENDS, ROUTE_NOT_FOUND)
    await _route(adapter)

    await _route(adapter)

    assert wheelchair.call_count == 2


@respx.mock
async def test_short_route_skips_retry(adapter: OpenRouteServiceProvider) -> None:
    wheelchair = respx.post(WHEELCHAIR_URL).mock(return_value=ROUTE_NOT_FOUND)
    respx.post(FOOT_URL).respond(200, json=foot_body(200.0))

    result = await _route(adapter)

    assert (wheelchair.call_count, result.fallback_profile_used) == (1, True)


@respx.mock
async def test_open_cooldown_skips_retry(
    adapter: OpenRouteServiceProvider, cooldown: RoutingCooldown
) -> None:
    def foot_while_quota_trips(_request: httpx.Request) -> httpx.Response:
        # Another request hits the quota between our foot call and the retry.
        cooldown.open(QuotaSignal.PER_MINUTE, CooldownDecision(60.0, "test"))
        return httpx.Response(200, json=FOOT_STEPS_BOTH_ENDS)

    wheelchair = respx.post(WHEELCHAIR_URL).mock(return_value=ROUTE_NOT_FOUND)
    respx.post(FOOT_URL).mock(side_effect=foot_while_quota_trips)

    result = await _route(adapter)

    assert (wheelchair.call_count, result.fallback_profile_used) == (1, True)


# --- /api/route contract ------------------------------------------------


@pytest.fixture
def ors_app_client() -> Iterator[TestClient]:
    settings = SETTINGS.model_copy(update={"rate_limit_enabled": False})
    with TestClient(create_app(settings)) as client:
        yield client


@respx.mock
def test_route_endpoint_exposes_unverified_segments(
    ors_app_client: TestClient,
) -> None:
    _mock_retry_scenario(FOOT_STEPS_BOTH_ENDS, httpx.Response(200, json=WHEELCHAIR_LEG))

    resp = ors_app_client.post(
        "/api/route", json={"from": FROM, "to": TO, "profile": "wheelchair"}
    )

    segments = resp.json()["features"][0]["properties"]["unverified_segments"]
    assert [(s["position"], s["reason"], s["geometry"]["type"]) for s in segments] == [
        ("start", "endpoint_steps_only", "LineString"),
        ("end", "endpoint_steps_only", "LineString"),
    ]
