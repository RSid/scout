import { expect, test, type Page } from "@playwright/test";

import { scoutMockApis } from "./mock-api-fixtures";

const INTERACTIVE = process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "interactive";

async function waitForScoutMap(page: Page) {
  await page.waitForFunction(() => {
    const w = window as typeof window & {
      scoutMap?: { getZoom?: () => number };
    };
    return w.scoutMap != null && typeof w.scoutMap.getZoom === "function";
  });
}

async function tabUntilFocusedOn(
  page: Page,
  name: "Zoom in" | "Zoom out",
): Promise<void> {
  const button = page.getByRole("button", { name, exact: true });
  await button.waitFor({ state: "visible" });

  for (let i = 0; i < 120; i += 1) {
    const isFocused = await button.evaluate(
      (el: HTMLElement) => el === document.activeElement,
    );
    if (isFocused) {
      return;
    }
    await page.keyboard.press("Tab");
  }

  throw new Error(`Exceeded Tab budget before focusing "${name}".`);
}

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

test.describe("interactive map zoom keyboard (M1-F02.S2)", () => {
  test.skip(
    !INTERACTIVE,
    "set NEXT_PUBLIC_SCOUT_MAP_MODE=interactive (Playwright CI does this)",
  );

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("scout.onboarded.v1", "true");
    });

    await scoutMockApis(page);
    await page.goto("/plan");

    await page.getByRole("heading", { name: /plan a walking route/i }).waitFor();

    await page.locator('[data-testid="basemap-shell"]').waitFor();
    await waitForScoutMap(page);
  });

  test("Tab reaches Zoom in MapLibre control", async ({ page }) => {
    await tabUntilFocusedOn(page, "Zoom in");

    await expect(
      page.getByRole("button", { name: "Zoom in", exact: true }),
    ).toBeFocused();
  });

  test("Zoom in increases zoom by one step with Enter", async ({ page }) => {
    await tabUntilFocusedOn(page, "Zoom in");

    const before = await page.evaluate(() => {
      const w = window as typeof window & {
        scoutMap?: { getZoom: () => number };
      };
      return w.scoutMap!.getZoom();
    });

    await page.keyboard.press("Enter");

    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as typeof window & {
            scoutMap?: { getZoom: () => number };
          };
          return w.scoutMap!.getZoom();
        }),
      )
      .toBeCloseTo(before + 1, 5);

    await expect(
      page.getByRole("button", { name: "Zoom in", exact: true }),
    ).toBeFocused();
  });

  test("Zoom in increases zoom by one step with Space", async ({ page }) => {
    await tabUntilFocusedOn(page, "Zoom in");

    const before = await page.evaluate(() => {
      const w = window as typeof window & {
        scoutMap?: { getZoom: () => number };
      };
      return w.scoutMap!.getZoom();
    });

    await page.keyboard.press(" ");

    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as typeof window & {
            scoutMap?: { getZoom: () => number };
          };
          return w.scoutMap!.getZoom();
        }),
      )
      .toBeCloseTo(before + 1, 5);

    await expect(
      page.getByRole("button", { name: "Zoom in", exact: true }),
    ).toBeFocused();
  });

  test("Zoom out decreases zoom by one step with Enter", async ({ page }) => {
    await tabUntilFocusedOn(page, "Zoom out");

    const before = await page.evaluate(() => {
      const w = window as typeof window & {
        scoutMap?: { getZoom: () => number };
      };
      return w.scoutMap!.getZoom();
    });

    await page.keyboard.press("Enter");

    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as typeof window & {
            scoutMap?: { getZoom: () => number };
          };
          return w.scoutMap!.getZoom();
        }),
      )
      .toBeCloseTo(before - 1, 5);

    await expect(
      page.getByRole("button", { name: "Zoom out", exact: true }),
    ).toBeFocused();
  });

  test("Zoom out decreases zoom by one step with Space", async ({ page }) => {
    await tabUntilFocusedOn(page, "Zoom out");

    const before = await page.evaluate(() => {
      const w = window as typeof window & {
        scoutMap?: { getZoom: () => number };
      };
      return w.scoutMap!.getZoom();
    });

    await page.keyboard.press(" ");

    await expect
      .poll(() =>
        page.evaluate(() => {
          const w = window as typeof window & {
            scoutMap?: { getZoom: () => number };
          };
          return w.scoutMap!.getZoom();
        }),
      )
      .toBeCloseTo(before - 1, 5);

    await expect(
      page.getByRole("button", { name: "Zoom out", exact: true }),
    ).toBeFocused();
  });
});
