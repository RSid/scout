/** Centralized deterministic API mocks for Scout Playwright suites. */

import type { Page } from "@playwright/test";

const MOCK_CATEGORIES = {
  categories: [
    {
      id: "curb_ramps",
      label: "Curb ramps",
      description: "Sidewalk transitions.",
      kind: "aid",
      default_enabled: true,
    },
  ],
};

const MOCK_CORRIDOR = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-77.034, 38.903] },
      properties: {
        id: "e2e:feat-1",
        category: "curb_ramps",
        kind: "obstacle",
        condition: "Good",
        condition_normalized: "good",
        inspected_year: 2021,
        source_dataset: "e2e",
        source_id: "1",
        attributes: {},
      },
    },
  ],
  meta: { truncated: false, time_taken_ms: 1 },
} as const;

export async function scoutMockApis(page: Page): Promise<void> {
  await page.route("**/api/categories", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CATEGORIES),
    });
  });

  await page.route("**/api/route-features", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CORRIDOR),
    });
  });
}
