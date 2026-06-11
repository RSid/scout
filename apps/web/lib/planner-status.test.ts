import { describe, expect, it } from "vitest";

import { derivePlannerStatus } from "./planner-status";
import { en } from "@/lib/i18n/messages";

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
