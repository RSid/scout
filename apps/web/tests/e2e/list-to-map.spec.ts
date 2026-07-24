/**
 * M1-F09 list → map focus bridge: expand when interactive map E2E is always on.
 * Today the default Playwright job may run in stub mode; this file documents the
 * contract and will grow once CI runs MapLibre unconditionally.
 */
import { expect, test } from "@playwright/test";

import { scoutMockApis } from "./mock-api-fixtures";

const INTERACTIVE = process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "interactive";

test.describe("parallel list to map", () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !INTERACTIVE,
      "requires interactive MapLibre (set NEXT_PUBLIC_SCOUT_MAP_MODE)",
    );

    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("scout.onboarded.v1", "true");
    });

    await scoutMockApis(page);
  });

  test("exposes Open on map buttons when corridor rows hydrate", async ({ page }) => {
    await page.goto("/plan");
    await page.getByRole("heading", { name: /plan a route/i }).waitFor();

    const openers = page.getByRole("button", { name: /^open on map$/i });
    await expect(openers.first()).toBeVisible();
  });
});
