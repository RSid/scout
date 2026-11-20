import { describe, expect, it } from "vitest";

import { derivePlannerStatus } from "./planner-status";
import { en, requestLimitMessages } from "@/lib/i18n/messages";

describe("derivePlannerStatus busy and rate-limit states (M1-F04, M1-F07)", () => {
  const WHEN = "in about a minute";

  it.each([
    ["ROUTE_SERVICE_BUSY", requestLimitMessages.routeBusyTitle],
    ["RATE_LIMIT", requestLimitMessages.routeRateLimitedTitle],
    ["ROUTE_SERVICE_UNAVAILABLE", en.routeUnavailableTitle],
    [undefined, en.routeUnavailableTitle],
  ])("titles a %s routing failure as %j", (code, title) => {
    const status = derivePlannerStatus({
      summaryMode: "approx-fallback",
      corridorStatus: "ready",
      routeFailure: { code, retryWhen: WHEN },
    });

    expect(status?.title).toBe(title);
  });

  it.each(["ROUTE_SERVICE_BUSY", "RATE_LIMIT"])(
    "tells people when to retry a %s routing failure",
    (code) => {
      const status = derivePlannerStatus({
        summaryMode: "approx-fallback",
        corridorStatus: "ready",
        routeFailure: { code, retryWhen: WHEN },
      });

      expect(status?.detail).toContain(`Try again ${WHEN}.`);
    },
  );

  it.each([
    ["RATE_LIMIT", `Try again ${WHEN}.`],
    ["CORRIDOR_QUERY_TIMEOUT", requestLimitMessages.corridorTimeoutDetail],
    ["ROUTE_GEOMETRY_TOO_LARGE", requestLimitMessages.corridorTooLargeDetail],
    ["REQUEST_TOO_LARGE", requestLimitMessages.corridorTooLargeDetail],
    ["OUTSIDE_SERVICE_AREA", requestLimitMessages.corridorOutsideAreaDetail],
    [undefined, en.corridorListingErrorDetail],
  ])("explains a %s corridor failure", (code, detail) => {
    const status = derivePlannerStatus({
      summaryMode: "live",
      corridorStatus: "error",
      corridorFailure: { code, retryWhen: WHEN },
    });

    expect(status?.detail).toContain(detail);
  });
});

describe("derivePlannerStatus", () => {
  it("surfaces the routing-unavailable warning above every other state", () => {
    const status = derivePlannerStatus({
      summaryMode: "approx-fallback",
      corridorStatus: "error",
    });

    expect(status).toStrictEqual({
      severity: "warning",
      title: en.routeUnavailableTitle,
      detail: en.routeApproxFallbackExplanation,
    });
  });

  it("surfaces a distinct corridor error when the route itself is fine", () => {
    const status = derivePlannerStatus({
      summaryMode: "live",
      corridorStatus: "error",
    });

    expect(status?.severity).toBe("error");
  });

  it("shows the pending state while a real route is in flight", () => {
    const status = derivePlannerStatus({
      summaryMode: "pending",
      corridorStatus: "loading",
    });

    expect(status?.severity).toBe("pending");
  });

  it("shows the sample hint on first load", () => {
    const status = derivePlannerStatus({
      summaryMode: "sample",
      corridorStatus: "ready",
    });

    expect(status?.severity).toBe("info");
  });

  it("returns null for a healthy live route with a settled corridor", () => {
    const status = derivePlannerStatus({
      summaryMode: "live",
      corridorStatus: "ready",
    });

    expect(status).toBeNull();
  });
});
