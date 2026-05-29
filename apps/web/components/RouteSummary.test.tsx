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
  it("shows pending copy while routing is in flight", async () => {
    const { container } = render(
      <RouteSummary summary={null} mode="pending" approximateDistanceMeters={400} />,
    );

    expect(screen.getByText(/straight-line preview/i)).toBeVisible();
    expect(screen.getByText(/calculating/i)).toBeVisible();

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
    const { container } = render(
      <RouteSummary
        summary={baseSummary}
        mode="live"
        approximateDistanceMeters={100}
      />,
    );

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
        approximateDistanceMeters={1}
      />,
    );

    expect(
      screen.queryByText(/wheelchair-aware routing wasn't available/i),
    ).not.toBeInTheDocument();

    rerender(
      <RouteSummary
        summary={{ ...baseSummary, fallbackProfileUsed: true }}
        mode="live"
        approximateDistanceMeters={1}
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
        approximateDistanceMeters={1}
      />,
    );

    expect(container.querySelector("img")).toBeNull();

    expect(screen.getByText(/injection attempt/i)).toBeVisible();
  });

  it("shows a routing-unavailable warning when mode is approx-fallback", async () => {
    const { container } = render(
      <RouteSummary
        summary={null}
        mode="approx-fallback"
        approximateDistanceMeters={422}
      />,
    );

    expect(screen.getByText(/walking directions unavailable/i)).toBeVisible();
    expect(screen.getByText(/couldn't reach the routing service/i)).toBeVisible();

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  it("shows sample copy before full routing is available", () => {
    render(
      <RouteSummary summary={null} mode="sample" approximateDistanceMeters={1200} />,
    );

    expect(screen.getByText(/sample route across dc/i)).toBeVisible();
    expect(screen.getByText("1.2 kilometers")).toBeVisible();
    expect(screen.getByText(/available after routing/i)).toBeVisible();
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
