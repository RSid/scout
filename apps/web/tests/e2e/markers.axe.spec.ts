/**
 * M1-F08 / DEC-009 placeholder: full marker + cluster + popup axe matrix needs
 * NEXT_PUBLIC_SCOUT_MAP_MODE=interactive in CI. Extend when the Playwright job
 * always runs interactive GL.
 */
import { expect, test } from "@playwright/test";

import { scoutMockApis } from "./mock-api-fixtures";

const INTERACTIVE = process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "interactive";

test.describe("markers map states (axe placeholders)", () => {
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

  test("plan route loads mocked corridor without crashing the map shell", async ({
    page,
  }) => {
    await page.goto("/plan");
    await page.getByRole("heading", { name: /plan a walking route/i }).waitFor();
    await page.locator('[data-testid="basemap-shell"]').waitFor();

    const summary = page.getByTestId("scout-route-summary");
    await expect(summary).toBeVisible();
  });
});
