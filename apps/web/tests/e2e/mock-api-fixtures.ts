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

/** Small DC LineString + summary props (`POST /api/route` wire shape). */
export const MOCK_ROUTE_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [
          [-77.0416, 38.8948],
          [-77.035, 38.903],
          [-77.0312, 38.9074],
        ],
      },
      properties: {
        distance_meters: 942,
        duration_seconds: 660,
        fallback_profile_used: false,
        warnings: ["narrow crossing"],
      },
    },
  ],
} as const;

export async function scoutMockApis(page: Page): Promise<void> {
  await page.route("**/api/categories", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_CATEGORIES),
    });
  });

  await page.route("**/api/route", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(MOCK_ROUTE_BODY),
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
