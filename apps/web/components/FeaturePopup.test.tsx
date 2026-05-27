import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FeaturePopup from "./FeaturePopup";

import type { ApiCategory, CorridorResponse } from "@/lib/api";
describe("FeaturePopup", () => {
  const restroomsCategory: ApiCategory = {
    id: "restrooms",
    label: "Public restrooms",
    description: "Neutral places to relieve yourself outdoors.",
    kind: "aid",
    default_enabled: true,
  };

  function pointFeature(
    properties: Record<string, unknown>,
  ): CorridorResponse["features"][number] {
    return {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-77.032, 38.907] },
      properties,
    } as CorridorResponse["features"][number];
  }

  it("surfaces restroom notes as literal text strings", () => {
    const props = pointFeature({
      category: restroomsCategory.id,
      kind: "aid",
      condition: "Neutral",
      condition_normalized: "good",
      inspected_year: 2018,
      source_dataset: "refugerestrooms",
      attributes: { notes: "Family restroom upstairs; ask staff." },
    });

    render(
      <FeaturePopup
        category={restroomsCategory}
        feature={props}
        referenceYear={2026}
      />,
    );

    expect(screen.getByText(restroomsCategory.label)).toBeVisible();
    expect(screen.getByText("Support")).toBeVisible();
    expect(screen.getAllByText("Neutral").length).toBeGreaterThan(0);
    expect(screen.getByText(/Family restroom upstairs/i)).toBeVisible();
  });

  it("surfaces stale chip copy when inspected year crosses the §7.8 threshold", () => {
    const props = pointFeature({
      category: "curb_ramps",
      kind: "obstacle",
      condition: "Non-compliant",
      condition_normalized: "blocking",
      inspected_year: 2016,
      source_dataset: "demo",
    });

    render(<FeaturePopup category={null} feature={props} referenceYear={2026} />);

    expect(screen.getByTestId("freshness-chip")).toHaveTextContent(
      /Data may be outdated \(last inspected 2016\)/,
    );
  });

  it("uses Inspection date unknown when inspected_year absent", () => {
    const props = pointFeature({
      category: "barriers",
      kind: "obstacle",
      condition: "Poor",
      condition_normalized: "difficult",
      source_dataset: "demo",
    });

    render(<FeaturePopup category={null} feature={props} />);

    expect(screen.getAllByText("Inspection date unknown").length).toBeGreaterThan(0);
  });

  it("routes jest-axe clean for nominal popup content", async () => {
    const props = pointFeature({
      category: restroomsCategory.id,
      kind: "aid",
      condition: "Neutral",
      condition_normalized: "good",
      inspected_year: 2019,
      source_dataset: "demo",
    });

    const { container } = render(
      <FeaturePopup
        category={restroomsCategory}
        feature={props}
        referenceYear={2026}
      />,
    );

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
