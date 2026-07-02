import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("scout.onboarded.v1", "true");
  });
});

test.describe("about page structure", () => {
  test("keeps WCAG-aligned language and heading scaffolding", async ({ page }) => {
    await page.goto("/about");

    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await expect.poll(async () => page.locator("h1").count()).toBe(1);
    await expect.poll(async () => page.locator("h3").count()).toBe(0);
  });
});
