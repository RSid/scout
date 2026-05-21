import { describe, expect, it } from "vitest";

import { FeatureMarkerAriaLabel, obstacleMarkerSlug } from "./FeatureMarker";

describe("obstacleMarkerSlug", () => {
  it.each([
    ["curb ramps", "triangle"],
    ["foo barrier bar", "diamond"],
    ["rest_spots", "pill"],
  ])("maps %s to shape token", (categoryId, slug) => {
    expect(obstacleMarkerSlug(categoryId)).toBe(slug);
  });
});

describe("FeatureMarkerAriaLabel", () => {
  it("joins semantic role and category wording", () => {
    expect(FeatureMarkerAriaLabel("aid", "Elevators")).toBe("aid: Elevators");
  });
});
