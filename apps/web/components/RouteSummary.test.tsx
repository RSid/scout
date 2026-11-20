import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { RouteSummaryPayload } from "@/lib/api";
import {
  DEMO_ROUTE_SUMMARY,
  FOOT_WALKING_FALLBACK_ROUTE_SUMMARY,
  RETRY_SUCCESS_ROUTE_SUMMARY,
  UNVERIFIED_END_SEGMENT,
  UNVERIFIED_START_SEGMENT,
} from "@/lib/fixtures/route-plan-fixtures";

import RouteSummary, {
  formatRouteDistanceLine,
  formatWalkingMinutes,
  isFootWalkingFallback,
} from "./RouteSummary";

/** PRD M1-F04 owner-approved copy, spelled out so the tests pin it verbatim. */
const FOOT_WALKING_FALLBACK_COPY =
  "We couldn't find a step-free route to this exact spot. In our map data it may only connect by steps. This is a standard walking route and may include steps, steep slopes or high curbs. Check for an accessible entrance before you go.";

describe("formatRouteDistanceLine", () => {
  it.each([
    [999, "999 meters"],
    [1000, "1 kilometer"],
    [1500, "1.5 kilometers"],
    [100_000, "100 kilometers"],
    [1, "1 meter"],
  ])("formats %s as %s", (meters, expected) => {
    expect(formatRouteDistanceLine(meters)).toBe(expected);
  });
});

describe("formatWalkingMinutes", () => {
  it.each([
    [0, ""],
    [30, "1 minute"],
    [90, "2 minutes"],
    [3600, "60 minutes"],
  ])("formats %s seconds as %s", (seconds, expected) => {
    expect(formatWalkingMinutes(seconds)).toBe(expected);
  });
});

const baseSummary: RouteSummaryPayload = {
  distanceMeters: 850,
  durationSeconds: 600,
  fallbackProfileUsed: false,
  warnings: [],
  unverifiedSegments: [],
};

describe("isFootWalkingFallback", () => {
  it.each([
    ["flag and warning code", true, ["fallback_profile:foot-walking"], true],
    ["flag only", true, [], true],
    ["warning code only", false, ["fallback_profile:foot-walking"], true],
    ["neither", false, [], false],
    ["unrelated warning only", false, ["narrow sidewalk"], false],
  ])("%s → %s", (_label, fallbackProfileUsed, warnings, expected) => {
    expect(
      isFootWalkingFallback({ ...baseSummary, fallbackProfileUsed, warnings }),
    ).toBe(expected);
  });
});

describe("RouteSummary", () => {
  it("shows calculating placeholders (no straight-line estimate) while routing is in flight", async () => {
    const { container } = render(<RouteSummary summary={null} mode="pending" />);

    // Distance and walking time both read "Calculating…"; no straight-line number.
    expect(screen.getAllByText(/calculating/i).length).toBeGreaterThan(0);

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  it("renders live distance, walking time, profile, and axe passes", async () => {
    const { container } = render(<RouteSummary summary={baseSummary} mode="live" />);

    expect(screen.getByRole("heading", { name: /^route summary$/i })).toBeVisible();
    expect(screen.getByText("850 meters")).toBeVisible();
    expect(screen.getByText("10 minutes")).toBeVisible();

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  // The routing-unavailable message now lives in the StatusStrip (see
  // StatusStrip / derivePlannerStatus / PlanExperience tests). RouteSummary
  // itself becomes numbers-only and shows "Unavailable" placeholders.
  it("shows unavailable placeholders without an inline warning when routing failed", async () => {
    const { container } = render(
      <RouteSummary summary={null} mode="approx-fallback" />,
    );

    expect(screen.queryByText(/directions unavailable/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/^unavailable$/i).length).toBeGreaterThan(0);

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  // Sample copy moved to the StatusStrip; the summary now shows the frozen
  // example route's real numbers instead of a straight-line estimate.
  it("shows the frozen sample route's real numbers on first load", () => {
    render(<RouteSummary summary={DEMO_ROUTE_SUMMARY} mode="sample" />);

    expect(screen.getByText("1.1 kilometers")).toBeVisible();
    expect(screen.getByText("12 minutes")).toBeVisible();
  });

  describe("foot-walking fallback notice (M1-F04 / M1-F05)", () => {
    it.each([
      ["flag and warning code", FOOT_WALKING_FALLBACK_ROUTE_SUMMARY],
      ["flag only", { ...FOOT_WALKING_FALLBACK_ROUTE_SUMMARY, warnings: [] }],
      [
        "warning code only",
        { ...FOOT_WALKING_FALLBACK_ROUTE_SUMMARY, fallbackProfileUsed: false },
      ],
    ])("shows the owner-approved copy verbatim (%s)", (_label, summary) => {
      render(<RouteSummary summary={summary} mode="live" />);

      expect(screen.getByText(FOOT_WALKING_FALLBACK_COPY)).toBeVisible();
    });

    it("never renders the raw fallback warning code", () => {
      render(
        <RouteSummary summary={FOOT_WALKING_FALLBACK_ROUTE_SUMMARY} mode="live" />,
      );

      expect(screen.queryByText(/fallback_profile/)).not.toBeInTheDocument();
    });

    it("shows a single fallback message, not the retired shorter sentence too", () => {
      render(
        <RouteSummary summary={FOOT_WALKING_FALLBACK_ROUTE_SUMMARY} mode="live" />,
      );

      expect({
        approved: screen.getAllByText(FOOT_WALKING_FALLBACK_COPY).length,
        retired: screen.queryByText(/wheelchair-aware routing wasn't available/i),
      }).toStrictEqual({ approved: 1, retired: null });
    });

    it("is absent for an ordinary wheelchair route", () => {
      render(<RouteSummary summary={baseSummary} mode="live" />);

      expect(screen.queryByText(FOOT_WALKING_FALLBACK_COPY)).not.toBeInTheDocument();
    });
  });

  describe("unknown warning entries", () => {
    it.each([
      ["a plain phrase", "narrow sidewalk"],
      [
        "an upstream object repr",
        "{'code': 1, 'message': 'There may be restrictions'}",
      ],
      ["markup", '<img alt="x" src="https://example.com/bad.png" /> injection attempt'],
    ])("does not render %s", (_label, warning) => {
      render(
        <RouteSummary summary={{ ...baseSummary, warnings: [warning] }} mode="live" />,
      );

      expect(screen.queryByText(warning, { exact: false })).not.toBeInTheDocument();
    });

    it("does not render markup from a warning entry", () => {
      const { container } = render(
        <RouteSummary
          summary={{
            ...baseSummary,
            warnings: ['<img alt="x" src="https://example.com/bad.png" />'],
          }}
          mode="live"
        />,
      );

      expect(container.querySelector("img")).toBeNull();
    });

    it("shows no notices list when only unknown codes are present", () => {
      render(
        <RouteSummary
          summary={{
            ...baseSummary,
            warnings: ["narrow sidewalk", "construction zone"],
          }}
          mode="live"
        />,
      );

      expect(screen.queryByRole("list")).not.toBeInTheDocument();
    });
  });

  describe("unverified segments (M1-F04 unverified_segments)", () => {
    it.each([
      [
        "end",
        UNVERIFIED_END_SEGMENT,
        "The last 135\u00A0m to this spot isn't part of the step-free route. In our map data it may only connect by steps.",
      ],
      [
        "start",
        UNVERIFIED_START_SEGMENT,
        "The first 41\u00A0m from this spot isn't part of the step-free route. In our map data it may only connect by steps.",
      ],
    ])("renders the %s line with rounded meters", (_label, segment, expected) => {
      render(
        <RouteSummary
          summary={{ ...baseSummary, unverifiedSegments: [segment] }}
          mode="live"
        />,
      );

      // Raw textContent (no whitespace normalization) so the non-breaking space
      // before "m" is asserted too.
      expect(screen.getByRole("listitem").textContent).toBe(expected);
    });

    it("lists one notice per segment under the notices heading", () => {
      render(<RouteSummary summary={RETRY_SUCCESS_ROUTE_SUMMARY} mode="live" />);

      const list = screen.getByRole("list", { name: /notices along this route/i });
      expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    });

    it("does not show the fallback notice for a retry-success route", () => {
      render(<RouteSummary summary={RETRY_SUCCESS_ROUTE_SUMMARY} mode="live" />);

      expect(screen.queryByText(FOOT_WALKING_FALLBACK_COPY)).not.toBeInTheDocument();
    });
  });

  it.each([
    ["ordinary route", baseSummary],
    ["foot-walking fallback", FOOT_WALKING_FALLBACK_ROUTE_SUMMARY],
    ["retry success with segments", RETRY_SUCCESS_ROUTE_SUMMARY],
    ["unknown warnings only", { ...baseSummary, warnings: ["narrow sidewalk"] }],
  ])("passes axe for the %s state", async (_label, summary) => {
    const { container } = render(<RouteSummary summary={summary} mode="live" />);

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
