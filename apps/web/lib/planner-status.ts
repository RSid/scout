import type { CorridorListingStatus } from "@/components/FeatureListView";
import type { RouteSummaryMode } from "@/components/RouteSummary";
import type { StatusSeverity } from "@/components/StatusStrip";

import { ScoutApiError } from "@/lib/api";
import {
  en,
  requestLimitMessages,
  retryWhenPhrase,
  routeAnnouncementApproxFallback,
  withRetryWhen,
} from "@/lib/i18n/messages";

export type PlannerStatus = Readonly<{
  severity: StatusSeverity;
  title: string;
  detail?: string;
}> | null;

/** Why a planner request failed, reduced to what the copy needs. */
export type RequestFailure = Readonly<{
  /** Backend `error.code`, e.g. `ROUTE_SERVICE_BUSY`; `undefined` for network errors. */
  code: string | undefined;
  /** "Try again …" phrase from `Retry-After`, e.g. "in about a minute". */
  retryWhen: string;
}>;

export function requestFailureFrom(
  reason: unknown,
  now: Date = new Date(),
): RequestFailure {
  if (reason instanceof ScoutApiError) {
    return {
      code: reason.code,
      retryWhen: retryWhenPhrase(reason.retryAfterSeconds, now),
    };
  }
  return { code: undefined, retryWhen: retryWhenPhrase(undefined) };
}

/** Live-region line for a failed `POST /api/route`. */
export function routeFailureAnnouncement(failure: RequestFailure | undefined): string {
  switch (failure?.code) {
    case "ROUTE_SERVICE_BUSY":
      return withRetryWhen(
        requestLimitMessages.routeBusyAnnouncementTemplate,
        failure.retryWhen,
      );
    case "RATE_LIMIT":
      return withRetryWhen(
        requestLimitMessages.routeRateLimitedAnnouncementTemplate,
        failure.retryWhen,
      );
    default:
      return routeAnnouncementApproxFallback();
  }
}

function routeFailureStatus(failure: RequestFailure | undefined): PlannerStatus {
  switch (failure?.code) {
    case "ROUTE_SERVICE_BUSY":
      return {
        severity: "warning",
        title: requestLimitMessages.routeBusyTitle,
        detail: withRetryWhen(
          requestLimitMessages.routeBusyDetailTemplate,
          failure.retryWhen,
        ),
      };
    case "RATE_LIMIT":
      return {
        severity: "warning",
        title: requestLimitMessages.routeRateLimitedTitle,
        detail: withRetryWhen(
          requestLimitMessages.routeRateLimitedDetailTemplate,
          failure.retryWhen,
        ),
      };
    default:
      return {
        severity: "warning",
        title: en.routeUnavailableTitle,
        detail: en.routeApproxFallbackExplanation,
      };
  }
}

/** Specific next step for a failed `POST /api/route-features`, or the generic one. */
export function corridorFailureDetail(failure: RequestFailure | undefined): string {
  switch (failure?.code) {
    case "RATE_LIMIT":
      return withRetryWhen(
        requestLimitMessages.corridorRateLimitedDetailTemplate,
        failure.retryWhen,
      );
    case "CORRIDOR_QUERY_TIMEOUT":
      return requestLimitMessages.corridorTimeoutDetail;
    case "ROUTE_GEOMETRY_TOO_LARGE":
    case "REQUEST_TOO_LARGE":
      return requestLimitMessages.corridorTooLargeDetail;
    case "OUTSIDE_SERVICE_AREA":
      return requestLimitMessages.corridorOutsideAreaDetail;
    default:
      return en.corridorListingErrorDetail;
  }
}

/** Live-region line for a failed `POST /api/route-features`. */
export function corridorFailureAnnouncement(
  failure: RequestFailure | undefined,
): string {
  const detail = corridorFailureDetail(failure);
  return detail === en.corridorListingErrorDetail
    ? en.corridorListingFailedBrief
    : detail;
}

/**
 * Single source of truth for the planner-wide status strip. Pure so it can be
 * unit-tested in isolation and kept out of JSX.
 *
 * Priority (most fundamental / most actionable first): a missing route beats a
 * missing corridor, which beats an in-flight route, which beats the first-load
 * sample hint. A healthy live route returns `null` — the route summary numbers
 * carry success, and empty corridor results are surfaced inline by the list.
 */
export function derivePlannerStatus(
  input: Readonly<{
    summaryMode: RouteSummaryMode;
    corridorStatus: CorridorListingStatus;
    /** Why routing failed, when `summaryMode` is `approx-fallback`. */
    routeFailure?: RequestFailure | undefined;
    /** Why the corridor query failed, when `corridorStatus` is `error`. */
    corridorFailure?: RequestFailure | undefined;
  }>,
): PlannerStatus {
  const { summaryMode, corridorStatus, routeFailure, corridorFailure } = input;

  if (summaryMode === "approx-fallback") {
    return routeFailureStatus(routeFailure);
  }

  if (corridorStatus === "error") {
    return {
      severity: "error",
      title: en.corridorListingErrorTitle,
      detail: corridorFailureDetail(corridorFailure),
    };
  }

  if (summaryMode === "pending") {
    return {
      severity: "pending",
      title: en.plannerPendingTitle,
      detail: en.plannerPendingDetail,
    };
  }

  if (summaryMode === "sample") {
    return {
      severity: "info",
      title: en.plannerSampleTitle,
      detail: en.plannerSampleDetail,
    };
  }

  return null;
}
