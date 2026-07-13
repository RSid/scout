import { describe, expect, it } from "vitest";

import { resolveLocationLabel } from "@/lib/map/location-label";

describe("resolveLocationLabel", () => {
  it("prefers a derived street name, rendered with the 'on' prefix", () => {
    const resolved = resolveLocationLabel({
      street_name: "14th St NW",
      source_dataset: "dc_curb_ramps",
    });

    expect(resolved).toStrictEqual({ text: "on 14th St NW", source: "street" });
  });

  it("falls back to the restroom address verbatim (no 'on' prefix)", () => {
    const resolved = resolveLocationLabel({
      street_name: null,
      source_dataset: "refugerestrooms",
      attributes: { address: "800 F Street NW, Washington, DC 20004" },
    });

    expect(resolved).toStrictEqual({
      text: "800 F Street NW, Washington, DC 20004",
      source: "address",
    });
  });

  it("returns null when both street name and restroom address are absent", () => {
    expect(
      resolveLocationLabel({
        street_name: null,
        source_dataset: "refugerestrooms",
        attributes: {},
      }),
    ).toBeNull();
  });

  it("returns null for a non-restroom feature with no street name", () => {
    expect(
      resolveLocationLabel({ street_name: "", source_dataset: "dc_barriers" }),
    ).toBeNull();
  });
});
