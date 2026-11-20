import { describe, expect, it } from "vitest";

import {
  en,
  onStreetLabel,
  routeAnnouncementApproxFallback,
  routeAnnouncementLoaded,
} from "./messages";
import { retryWhenPhrase } from "./messages";

describe("retryWhenPhrase (busy and rate-limit copy)", () => {
  // Local noon, so "later today" and "tomorrow" don't depend on the runner's zone.
  const NOON = new Date(2026, 10, 20, 12, 0, 0);

  it.each([
    [undefined, "in a little while"],
    [0, "in a little while"],
    [5, "in a few seconds"],
    [60, "in about a minute"],
    [600, "in about 10 minutes"],
    [3600, "in about an hour"],
    [3 * 3600, "in about 3 hours"],
    [8 * 3600, "later today"],
    [14 * 3600, "tomorrow"],
    [24 * 3600, "tomorrow"],
  ])("phrases %s seconds as %s", (seconds, phrase) => {
    expect(retryWhenPhrase(seconds, NOON)).toBe(phrase);
  });
});

describe("English UI strings scaffold", () => {
  it("gates the verbatim M1-F02 map narration strings behind stable keys", () => {
    expect(en.mapPlanAriaLabel).toBe("Interactive map of Washington, DC");
    expect(en.mapPlanKeyboardHint).toBe(
      "Tab to reach map controls. Press M then arrow keys to pan.",
    );
  });

  it("exports locale metadata alongside marketing title", () => {
    expect(`${en.locale} ${en.scoutTitle}`).toMatch(/routes and accessibility data/);
  });

  it("keeps route summary headings and fallback copy under stable keys (M1-F05)", () => {
    expect(en.routeSummaryHeading).toStrictEqual("Route summary");
    expect(en.routeProfileFallbackNote).toContain("standard directions");
  });

  it("builds polite route-loaded announcements from distance and duration", () => {
    expect(routeAnnouncementLoaded(850, 660)).toBe(
      "Route loaded: 0.9 kilometers, 11 minutes",
    );

    expect(routeAnnouncementApproxFallback()).toMatch(/couldn't load directions/i);
  });

  it("prefixes a street location label with 'on' (M2-F24)", () => {
    expect(onStreetLabel("14th St NW")).toBe("on 14th St NW");
  });
});
