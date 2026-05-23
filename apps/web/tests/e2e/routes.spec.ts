import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "@playwright/test";

import { scoutMockApis } from "./mock-api-fixtures";

const PLAN_AXE_TIMEOUT_MS =
  process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "interactive" ? 240_000 : 120_000;

const ROUTES_TO_SCAN = ["/", "/about", "/privacy", "/plan"] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    // Planner tests need onboarding dismissed so dialogs do not swallow the route shell.
    localStorage.setItem("scout.onboarded.v1", "true");
  });

  await scoutMockApis(page);
});

ROUTES_TO_SCAN.forEach((pathname) => {
  test(`axe scan succeeds for ${pathname}`, async ({ page }) => {
    test.setTimeout(pathname === "/plan" ? PLAN_AXE_TIMEOUT_MS : 60_000);

    await page.goto(pathname);

    if (pathname === "/plan") {
      await page.locator("#scout-plan-heading").waitFor({ state: "visible" });

      if (process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "interactive") {
        await page.locator('[data-testid="basemap-shell"]').waitFor({
          state: "visible",
          timeout: PLAN_AXE_TIMEOUT_MS,
        });
      }
    }

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toStrictEqual([]);
  });
});
