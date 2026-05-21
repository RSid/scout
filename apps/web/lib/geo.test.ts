import type { GeoJSON } from "geojson";
import { describe, expect, it } from "vitest";

import {
  formatApproxMeters,
  roughDistanceMeters,
  summarizeLineStringDegrees,
} from "./geo";

describe("formatApproxMeters", () => {
  it("formats plural meters", () => {
    expect(formatApproxMeters(12)).toBe("~12 meters");
  });

  it("uses singular meter for distance 1", () => {
    expect(formatApproxMeters(1)).toBe("~1 meter");
  });

  it.each([
    [-1, /distance must be/],
    [Number.NaN, /distance must be/],
    [Number.POSITIVE_INFINITY, /distance must be/],
  ] as const)("throws for invalid %s", (distance, matcher) => {
    expect(() => formatApproxMeters(distance)).toThrow(matcher);
  });
});

describe("roughDistanceMeters", () => {
  it("returns non-negative finite distance between two points", () => {
    const d = roughDistanceMeters(-77.04, 38.89, -77.03, 38.91);
    expect(d).toBeGreaterThan(0);
    expect(d).toBeLessThan(20_000);
  });
});

describe("summarizeLineStringDegrees", () => {
  it("sums segment lengths across a corridor", () => {
    const line = [
      [0, 0],
      [0, 1],
      [1, 1],
    ] as const satisfies [[number, number], [number, number], [number, number]];

    const { alongMetersRough, crossMetersRough } = summarizeLineStringDegrees(
      line,
      0.5,
      0,
    );

    expect(alongMetersRough).toBeGreaterThan(crossMetersRough);
    expect(Number.isFinite(crossMetersRough)).toBe(true);
  });

  it("throws when the line string is too short", () => {
    expect(() =>
      summarizeLineStringDegrees([[0, 0]], 0, 0),
    ).toThrow(/at least two coordinate/);

    expect(() => summarizeLineStringDegrees([], 0, 0)).toThrow(/at least two coordinate/);
  });

  it("throws when coordinates are malformed", () => {
    const line = [
      [0],
      [0],
    ] as GeoJSON.LineString["coordinates"];

    expect(() => summarizeLineStringDegrees(line, 0, 0)).toThrow(/invalid coordinate/);
  });
});
