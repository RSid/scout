import { describe, expect, it } from "vitest";

import { FeatureMarkerAriaLabel } from "./FeatureMarker";

import { en } from "@/lib/i18n/messages";

describe("FeatureMarkerAriaLabel", () => {
  it("uses category label, condition, and canonical inspection year fragment", () => {
    expect(FeatureMarkerAriaLabel("Curb ramps", "Non-compliant", 2016)).toBe(
      `Curb ramps, Non-compliant, ${en.lastInspectedShort} 2016`,
    );
  });

  it("uses inspection date unknown fragment when the year is absent", () => {
    expect(FeatureMarkerAriaLabel("Curb ramps", "Good", null)).toContain(
      en.inspectionDateUnknownAriaFragment,
    );
  });

  it("falls back to aria condition unknown when condition is empty", () => {
    expect(FeatureMarkerAriaLabel("Barriers", "", 2018)).toContain(
      en.conditionUnknownForAria,
    );
  });

  it("includes the location fragment between condition and inspection", () => {
    expect(FeatureMarkerAriaLabel("Curb ramps", "Good", 2021, "on 14th St NW")).toBe(
      `Curb ramps, Good, on 14th St NW, ${en.lastInspectedShort} 2021`,
    );
  });

  it("omits the location fragment when no location is provided", () => {
    expect(FeatureMarkerAriaLabel("Curb ramps", "Good", 2021, null)).toBe(
      `Curb ramps, Good, ${en.lastInspectedShort} 2021`,
    );
  });
});
