import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import FeatureListView from "./FeatureListView";

import { DEMO_ROUTE, demoCorridorFeatures } from "@/lib/fixtures/route-plan-fixtures";

describe("FeatureListView", () => {
  it("renders nearby feature heading for fixture data", async () => {
    const { container } = render(
      <FeatureListView route={DEMO_ROUTE} features={demoCorridorFeatures()} />,
    );

    expect(
      screen.getByRole("heading", { level: 2, name: /Nearby features \(2\)/ }),
    ).toBeVisible();

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
