import { describe, expect, it } from "vitest";

import {
  en,
  onStreetLabel,
  routeAnnouncementApproxFallback,
  routeAnnouncementLoaded,
  unverifiedSegmentNotice,
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

/** PRD M1-F04 owner-approved copy, spelled out here so the test pins it verbatim. */
const FOOT_WALKING_FALLBACK_COPY =
  "We couldn't find a step-free route to this exact spot. In our map data it may only connect by steps. This is a standard walking route and may include steps, steep slopes or high curbs. Check for an accessible entrance before you go.";

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

  it("keeps the route summary heading under a stable key (M1-F05)", () => {
    expect(en.routeSummaryHeading).toStrictEqual("Route summary");
  });

  // `routeProfileFallbackNote` was retired: the owner-approved notice below
  // replaces it so users never see two fallback messages.
  it.each([
    ["routeFootWalkingFallbackNotice", en.routeFootWalkingFallbackNotice],
    ["routeAnnouncementWheelchairFallback", en.routeAnnouncementWheelchairFallback],
  ])(
    "%s is the owner-approved foot-walking fallback copy verbatim (M1-F04)",
    (_key, text) => {
      expect(text).toBe(FOOT_WALKING_FALLBACK_COPY);
    },
  );

  it.each([
    [
      "end" as const,
      134.6,
      "The last 135\u00A0m to this spot isn't part of the step-free route. In our map data it may only connect by steps.",
    ],
    [
      "start" as const,
      41.2,
      "The first 41\u00A0m from this spot isn't part of the step-free route. In our map data it may only connect by steps.",
    ],
    [
      "end" as const,
      0.2,
      "The last 1\u00A0m to this spot isn't part of the step-free route. In our map data it may only connect by steps.",
    ],
  ])(
    "unverifiedSegmentNotice(%s, %s) rounds to whole meters with a non-breaking space",
    (position, meters, expected) => {
      expect(unverifiedSegmentNotice(position, meters)).toBe(expected);
    },
  );

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
