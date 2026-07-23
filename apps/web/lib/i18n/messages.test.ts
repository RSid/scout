import { describe, expect, it } from "vitest";

import {
  en,
  onStreetLabel,
  routeAnnouncementApproxFallback,
  routeAnnouncementLoaded,
} from "./messages";

describe("English UI strings scaffold", () => {
  it("gates the verbatim M1-F02 map narration strings behind stable keys", () => {
    expect(en.mapPlanAriaLabel).toBe("Interactive map of Washington, DC");
    expect(en.mapPlanKeyboardHint).toBe(
      "Tab to reach map controls. Press M then arrow keys to pan.",
    );
  });

  it("exports locale metadata alongside marketing title", () => {
    expect(`${en.locale} ${en.scoutTitle}`).toMatch(
      /walking routes and accessibility data/,
    );
  });

  it("keeps route summary headings and fallback copy under stable keys (M1-F05)", () => {
    expect(en.routeSummaryHeading).toStrictEqual("Route summary");
    expect(en.routeProfileFallbackNote).toContain("standard walking directions");
  });

  it("builds polite route-loaded announcements from distance and duration", () => {
    expect(routeAnnouncementLoaded(850, 660)).toBe(
      "Route loaded: 0.9 kilometers, 11 minutes",
    );

    expect(routeAnnouncementApproxFallback()).toMatch(
      /couldn't load walking directions/i,
    );
  });

  it("prefixes a street location label with 'on' (M2-F24)", () => {
    expect(onStreetLabel("14th St NW")).toBe("on 14th St NW");
  });
});
