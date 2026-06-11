import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RouteSummary, {
  formatRouteDistanceLine,
  formatWalkingMinutes,
} from "./RouteSummary";

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

describe("RouteSummary", () => {
  it("shows calculating placeholders (no straight-line estimate) while routing is in flight", async () => {
    const { container } = render(<RouteSummary summary={null} mode="pending" />);

    // Distance and walking time both read "Calculating…"; no straight-line number.
    expect(screen.getAllByText(/calculating/i).length).toBeGreaterThan(0);

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
  const baseSummary = {
    distanceMeters: 850,
    durationSeconds: 600,
    fallbackProfileUsed: false,
    warnings: [] as readonly string[],
  };

  it("renders live distance, walking time, profile, and axe passes", async () => {
    const { container } = render(<RouteSummary summary={baseSummary} mode="live" />);

    expect(screen.getByRole("heading", { name: /^route summary$/i })).toBeVisible();
    expect(screen.getByText("850 meters")).toBeVisible();
    expect(screen.getByText("10 minutes")).toBeVisible();
    expect(screen.getByText(/wheelchair-aware route/i)).toBeVisible();

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  it("shows fallback sentence only when fallback_profile_used is true", () => {
    const { rerender } = render(
      <RouteSummary
        summary={{ ...baseSummary, fallbackProfileUsed: false }}
        mode="live"
      />,
    );

    expect(
      screen.queryByText(/wheelchair-aware routing wasn't available/i),
    ).not.toBeInTheDocument();

    rerender(
      <RouteSummary
        summary={{ ...baseSummary, fallbackProfileUsed: true }}
        mode="live"
      />,
    );

    expect(
      screen.getByText(/wheelchair-aware routing wasn't available/i),
    ).toBeVisible();
  });

  it("renders warnings as plain text without interpreting HTML", () => {
    const { container } = render(
      <RouteSummary
        summary={{
          ...baseSummary,
          warnings: [
            '<img alt="x" src="https://example.com/bad.png" /> injection attempt',
          ],
        }}
        mode="live"
      />,
    );

    expect(container.querySelector("img")).toBeNull();

    expect(screen.getByText(/injection attempt/i)).toBeVisible();
  });

  // The routing-unavailable message now lives in the StatusStrip (see
  // StatusStrip / derivePlannerStatus / PlanExperience tests). RouteSummary
  // itself becomes numbers-only and shows "Unavailable" placeholders.
  it("shows unavailable placeholders without an inline warning when routing failed", async () => {
    const { container } = render(
      <RouteSummary summary={null} mode="approx-fallback" />,
    );

    expect(
      screen.queryByText(/walking directions unavailable/i),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText(/^unavailable$/i).length).toBeGreaterThan(0);

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  // Sample copy moved to the StatusStrip; the summary now shows the frozen
  // example route's real numbers instead of a straight-line estimate.
  it("shows the frozen sample route's real numbers on first load", () => {
    render(
      <RouteSummary
        summary={{
          distanceMeters: 1089,
          durationSeconds: 731.4,
          fallbackProfileUsed: false,
          warnings: [],
        }}
        mode="sample"
      />,
    );

    expect(screen.getByText("1.1 kilometers")).toBeVisible();
    expect(screen.getByText("12 minutes")).toBeVisible();
  });

  it("lists notices as chips when warnings are present", async () => {
    const { container } = render(
      <RouteSummary
        summary={{
          ...baseSummary,
          warnings: ["narrow sidewalk", "construction zone"],
        }}
        mode="live"
        approximateDistanceMeters={1}
      />,
    );

    expect(screen.getByText("narrow sidewalk")).toBeVisible();

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
