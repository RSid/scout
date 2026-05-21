import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "@playwright/test";

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
} as const;

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

const ROUTES_TO_SCAN = ["/", "/about", "/privacy", "/plan"] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    // Planner tests need onboarding dismissed so dialogs do not swallow the route shell.
    localStorage.setItem("scout.onboarded.v1", "true");
  });

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
});

ROUTES_TO_SCAN.forEach((pathname) => {
  test(`axe scan succeeds for ${pathname}`, async ({ page }) => {
    test.setTimeout(pathname === "/plan" ? 120_000 : 60_000);

    await page.goto(pathname);

    if (pathname === "/plan") {
      await page.locator("#scout-plan-heading").waitFor({ state: "visible" });
    }

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toStrictEqual([]);
  });
});
