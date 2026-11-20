"""OpenRouteService routing adapter."""

from __future__ import annotations

import logging
from typing import Any, NoReturn

import httpx

from scout.clients.routing.cache import TTLCache, routing_cache_key
from scout.clients.routing.constants import FALLBACK_PROFILE_WARNING
from scout.clients.routing.cooldown import (
    QuotaSignal,
    RoutingCooldown,
    decide_cooldown,
    is_daily_quota_exhausted,
)
from scout.clients.routing.endpoint_nudge import (
    NudgePlan,
    nudged_endpoints,
    plan_endpoint_nudge,
    step_runs,
    stitch_nudged_route,
)
from scout.clients.routing.ors_response import (
    ors_body_to_computation,
    route_coordinates,
    waytype_ranges,
    without_extras,
)
from scout.clients.routing.protocol import RoutingProvider
from scout.clients.routing.types import RoutingComputation
from scout.config import Settings
from scout.errors import (
    ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
    RouteNotFoundError,
    RouteServiceBusyError,
    RouteServiceUnavailableError,
)
from scout.geo import cumulative_distances_m

LOGGER = logging.getLogger("scout")

__all__ = ["OpenRouteServiceProvider", "routing_cache_key"]

# ORS's documented wheelchair defaults, sent explicitly. Without `options`,
# ORS applies no incline, curb, or surface limits at all; the defaults only
# take effect when sent. Shape and values per the wheelchair example at
# https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/routing-options
# (`cobblestone:flattened` and `sett` map to the same ORS surface class.)
WHEELCHAIR_DEFAULT_RESTRICTIONS: dict[str, Any] = {
    "maximum_incline": 6,
    "maximum_sloped_kerb": 0.06,
    "smoothness_type": "good",
    "surface_type": "cobblestone:flattened",
    "track_type": "grade1",
}

# Extra request fields per ORS profile. Foot-walking asks for `waytype` so the
# wheelchair retry can find steps near each end (waytype 8 = Steps).
_PROFILE_REQUEST_FIELDS: dict[str, dict[str, Any]] = {
    "wheelchair": {
        "options": {"profile_params": {"restrictions": WHEELCHAIR_DEFAULT_RESTRICTIONS}}
    },
    "foot-walking": {"extra_info": ["waytype"]},
}


def _log_retry(outcome: str, plan: NudgePlan | None) -> None:
    """One line per wheelchair-retry decision, so the extra ORS calls are
    visible (DEC-003: instrument routing call volume). No coordinates."""

    extra: dict[str, Any] = {"upstream_service": "openrouteservice", "outcome": outcome}
    if plan is not None:
        extra |= {
            "nudged_ends": plan.nudged_ends,
            "steps_near_start": plan.steps_near_start,
            "steps_near_end": plan.steps_near_end,
            "unverified_meters": round(plan.start_offset_m + plan.end_offset_m),
        }
    LOGGER.info("wheelchair_endpoint_retry", extra=extra)


class OpenRouteServiceProvider(RoutingProvider):
    """Calls the public hosted ORS Directions API."""

    def __init__(
        self,
        *,
        settings: Settings,
        client: httpx.AsyncClient,
        cooldown: RoutingCooldown | None = None,
    ) -> None:
        self._settings = settings
        self._client = client
        self._cache: TTLCache[RoutingComputation] = TTLCache()
        self._cooldown = cooldown or RoutingCooldown()

    async def walking_route(
        self,
        frm: list[float],
        to: list[float],
        *,
        profile: str,
    ) -> RoutingComputation:
        # `profile` is the Scout-domain mode token. M1 wires only
        # "wheelchair" through, but we key the cache on whatever the
        # caller asked for so future modes (M2-F18) don't collide.
        key = routing_cache_key(profile, frm + to)
        cached = self._cache.get(key)
        if cached is not None:
            LOGGER.info(
                "route_cache",
                extra={
                    "cache_hit": True,
                    "fallback_profile_used": cached.fallback_profile_used,
                    "upstream_service": "openrouteservice",
                },
            )
            return cached

        LOGGER.info(
            "route_cache",
            extra={
                "cache_hit": False,
                "fallback_profile_used": False,
                "upstream_service": "openrouteservice",
            },
        )

        coords = [[frm[0], frm[1]], [to[0], to[1]]]
        api_key = (self._settings.ors_api_key or "").strip()
        if not api_key:
            raise RouteServiceUnavailableError(
                message="Routing service credentials are missing for this deployment."
            )
        # Cache hits above stay available while ORS is cooling down; only
        # requests that would cost an upstream call are turned away.
        retry_after = self._cooldown.seconds_remaining()
        if retry_after is not None:
            raise RouteServiceBusyError(retry_after_seconds=retry_after)

        # M1 only requests the wheelchair-aware ORS profile; foot-walking is
        # the internal fallback (S3). When more Scout-domain modes land we
        # will dispatch from `profile` to a vendor string here, not in the
        # caller. A quota error on wheelchair raises RouteServiceBusyError,
        # not RouteNotFoundError, so we don't spend another call on foot-walking.
        try:
            response = await self._call_directions("wheelchair", coords, api_key)
        except RouteNotFoundError:
            computation = await self._route_without_wheelchair_match(coords, api_key)
        else:
            computation = ors_body_to_computation(response, fallback_used=False)

        self._cache.set(key, computation)
        return computation

    async def _route_without_wheelchair_match(
        self, coords: list[list[float]], api_key: str
    ) -> RoutingComputation:
        """Foot-walking fallback, upgraded by one wheelchair retry when it works.

        Worst case this costs two more ORS calls (foot-walking, then the
        retry). Errors from the foot-walking call propagate as before.
        """

        foot_body = await self._call_directions("foot-walking", coords, api_key)
        foot = ors_body_to_computation(without_extras(foot_body), fallback_used=True)
        foot = foot.model_copy(
            update={"warnings": (*foot.warnings, FALLBACK_PROFILE_WARNING)}
        )
        retried = await self._retry_wheelchair_near_endpoints(foot_body, foot, api_key)
        return retried if retried is not None else foot

    async def _retry_wheelchair_near_endpoints(
        self, foot_body: dict[str, Any], foot: RoutingComputation, api_key: str
    ) -> RoutingComputation | None:
        """One wheelchair retry between points moved off step-only endpoints.

        Returns ``None`` (keep the foot-walking fallback) when the trip is too
        short to nudge, ORS is cooling down, or the retry fails for any reason,
        including quota (which still opens the cooldown).
        """

        line = route_coordinates(foot_body)
        cumulative = cumulative_distances_m(line)
        total_m = cumulative[-1] if cumulative else 0.0
        plan = plan_endpoint_nudge(
            total_m, step_runs(cumulative, waytype_ranges(foot_body))
        )
        if plan is None:
            _log_retry("skipped_short_route", None)
            return None
        if self._cooldown.seconds_remaining() is not None:
            _log_retry("skipped_cooldown", plan)
            return None

        start, end = nudged_endpoints(line, cumulative, plan)
        retry_coords = [[round(c, 6) for c in start], [round(c, 6) for c in end]]
        try:
            body = await self._call_directions("wheelchair", retry_coords, api_key)
            wheelchair = ors_body_to_computation(body, fallback_used=False)
        except RouteServiceBusyError:
            _log_retry("quota", plan)
            return None
        except RouteNotFoundError:
            _log_retry("not_found", plan)
            return None
        except RouteServiceUnavailableError:
            _log_retry("unavailable", plan)
            return None
        _log_retry("success", plan)
        return stitch_nudged_route(
            foot_coordinates=line,
            foot_cumulative=cumulative,
            foot_duration_seconds=foot.duration_seconds,
            plan=plan,
            wheelchair=wheelchair,
            wheelchair_coordinates=route_coordinates(body),
        )

    async def _call_directions(
        self, profile: str, coordinates: list[list[float]], api_key: str
    ) -> dict[str, Any]:
        route = profile.replace("/", "").strip()
        url = f"{self._settings.ors_base_url.rstrip('/')}/v2/directions/{route}/geojson"
        headers = {"Content-Type": "application/json"}
        token = (
            api_key if api_key.lower().startswith("bearer ") else f"Bearer {api_key}"
        )
        headers["Authorization"] = token

        payload: dict[str, Any] = {
            "coordinates": coordinates,
            "instructions": False,
            "units": "m",
            **_PROFILE_REQUEST_FIELDS.get(route, {}),
        }

        try:
            resp = await self._client.post(
                url, json=payload, headers=headers, timeout=3.0
            )
        except httpx.HTTPError as exc:
            raise RouteServiceUnavailableError(
                message=ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
            ) from exc

        if resp.status_code == 429:
            self._raise_busy(QuotaSignal.PER_MINUTE, resp.headers)
        if is_daily_quota_exhausted(resp.status_code, resp.headers):
            self._raise_busy(QuotaSignal.DAILY, resp.headers)
        if resp.status_code in {401, 403}:
            raise RouteServiceUnavailableError(message="Routing credentials rejected.")
        if resp.status_code in {404, 204} or not resp.content:
            raise RouteNotFoundError()
        if resp.status_code >= 500:
            raise RouteServiceUnavailableError(
                message=ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
            )
        try:
            parsed: Any = resp.json()
        except ValueError:
            raise RouteServiceUnavailableError(
                message=ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
            ) from None
        if not isinstance(parsed, dict):
            raise RouteServiceUnavailableError(
                message=ROUTE_SERVICE_DEFAULT_USER_MESSAGE,
            )
        body: dict[str, Any] = parsed
        return body

    def _raise_busy(self, signal: QuotaSignal, headers: httpx.Headers) -> NoReturn:
        decision = decide_cooldown(
            signal,
            headers,
            now=self._cooldown.now(),
            policy=self._cooldown.policy,
        )
        retry_after = self._cooldown.open(signal, decision)
        raise RouteServiceBusyError(retry_after_seconds=retry_after)
