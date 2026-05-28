import AxeBuilder from "@axe-core/playwright";

import { expect, test } from "@playwright/test";

import { scoutMockApis } from "./mock-api-fixtures";

const PLAN_AXE_TIMEOUT_MS =
  process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "interactive" ? 240_000 : 120_000;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    // Planner tests need onboarding dismissed so dialogs do not swallow the route shell.
    localStorage.setItem("scout.onboarded.v1", "true");
  });

  await scoutMockApis(page);
});

const ROUTES_STUB_AXE = ["/", "/about", "/privacy", "/plan"] as const;

ROUTES_STUB_AXE.forEach((pathname) => {
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

test(
  "axe scan succeeds for /plan @interactive",
  { tag: "@interactive" },
  async ({ page }) => {
    test.skip(
      process.env.NEXT_PUBLIC_SCOUT_MAP_MODE !== "interactive",
      "requires NEXT_PUBLIC_SCOUT_MAP_MODE=interactive",
    );

    test.setTimeout(PLAN_AXE_TIMEOUT_MS);

    await page.goto("/plan");

    await page.locator("#scout-plan-heading").waitFor({ state: "visible" });
    await page.locator('[data-testid="basemap-shell"]').waitFor({
      state: "visible",
      timeout: PLAN_AXE_TIMEOUT_MS,
    });

    const results = await new AxeBuilder({ page }).analyze();

    expect(results.violations).toStrictEqual([]);
  },
);
