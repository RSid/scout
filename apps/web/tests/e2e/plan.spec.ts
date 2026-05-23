import { expect, test } from "@playwright/test";

import { scoutMockApis } from "./mock-api-fixtures";

test.describe("plan view keyboard affordances", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("scout.onboarded.v1", "true");
    });

    await scoutMockApis(page);
  });

  test("Skip map activates the textual route list landmark", async ({ page }) => {
    await page.goto("/plan");
    await page.getByRole("heading", { name: /plan a walking route/i }).waitFor();

    await page.getByRole("link", { name: "Skip map", exact: true }).focus();
    await page.keyboard.press("Enter");

    await expect(page.locator("#scout-route-list")).toBeFocused();
  });

  test("honours prefers-reduced-motion for media queries", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    await page.goto("/plan");
    await page.getByRole("heading", { name: /plan a walking route/i }).waitFor();

    await expect
      .poll(async () =>
        page.evaluate(
          () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      )
      .toBe(true);
  });
});
