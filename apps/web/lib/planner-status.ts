import type { CorridorListingStatus } from "@/components/FeatureListView";
import type { RouteSummaryMode } from "@/components/RouteSummary";
import type { StatusSeverity } from "@/components/StatusStrip";

import { en } from "@/lib/i18n/messages";

export type PlannerStatus = Readonly<{
  severity: StatusSeverity;
  title: string;
  detail?: string;
}> | null;

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
  }>,
): PlannerStatus {
  const { summaryMode, corridorStatus } = input;

  if (summaryMode === "approx-fallback") {
    return {
      severity: "warning",
      title: en.routeUnavailableTitle,
      detail: en.routeApproxFallbackExplanation,
    };
  }

  if (corridorStatus === "error") {
    return {
      severity: "error",
      title: en.corridorListingErrorTitle,
      detail: en.corridorListingErrorDetail,
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
