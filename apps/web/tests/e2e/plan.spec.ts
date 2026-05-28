import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { scoutMockApis } from "./mock-api-fixtures";

const INTERACTIVE = process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "interactive";

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

async function tabUntilComboboxFocused(page: Page, namePattern: RegExp): Promise<void> {
  const combobox = page.getByRole("combobox", { name: namePattern });
  await combobox.waitFor({ state: "visible" });

  for (let i = 0; i < 120; i += 1) {
    const isFocused = await combobox.evaluate(
      (el: HTMLElement) => el === document.activeElement,
    );

    if (isFocused === true) {
      return;
    }

    await page.keyboard.press("Tab");
  }

  throw new Error(
    `Exceeded Tab budget before focusing combobox /${namePattern.source}/.`,
  );
}

async function dismissScoutOnboardingIfShown(page: Page): Promise<void> {
  /**
   * Radix onboarding uses a full-viewport overlay (`pointer-events` on `<html>` in dev),
   * which blocks option clicks. Tests set `scout.onboarded.v1` via `addInitScript`, but a
   * brief flash can still steal the first pointer interaction.
   */
  await page
    .getByRole("button", { name: /^not now$/i })
    .click({ timeout: 6000 })
    .catch(() => {});
}

/**
 * Fills planner start/destination against the bundled stub geocoder: "14th" → 1400 U Street;
 * "Dupont" → Dupont Circle. Mirrors the historical PW keyboard sequence; waits past
 * AddressAutocomplete DEBOUNCE_MS (500) before list navigation; gates completion on `/api/route` POST.
 */
async function keyboardFillPlannerAddressesFromStubHits(page: Page): Promise<void> {
  /** Must exceed AddressAutocomplete DEBOUNCE_MS so we never ArrowDown against stale hits. */
  const debouncePaddingMs = 600;

  const routePosted = page.waitForResponse(
    (response) =>
      response.url().includes("/api/route") &&
      response.request().method() === "POST" &&
      response.status() === 200,
    { timeout: 45_000 },
  );

  await page.getByRole("heading", { name: /plan a walking route/i }).waitFor();

  await dismissScoutOnboardingIfShown(page);

  await tabUntilComboboxFocused(page, /starting point/i);

  const start = page.getByRole("combobox", { name: /starting point/i });

  await start.type("14th", { delay: 0 });

  await expect
    .poll(async () => (await start.inputValue()).trim().length)
    .toBeGreaterThanOrEqual(4);

  await page.waitForTimeout(debouncePaddingMs);

  await expect(page.getByRole("status")).toContainText(/\d suggestion/i, {
    timeout: 20_000,
  });

  await start.press("ArrowDown");

  await expect(
    page.getByRole("option", { name: /1400 U Street/i }).first(),
  ).toBeVisible({
    timeout: 20_000,
  });

  await page.keyboard.press("Enter");

  await expect
    .poll(
      async () => (await start.inputValue()).toLowerCase().includes("1400 u street"),
      { timeout: 30_000 },
    )
    .toBe(true);

  await tabUntilComboboxFocused(page, /destination/i);

  const destination = page.getByRole("combobox", { name: /destination/i });

  await destination.type("Dupont", { delay: 0 });

  await expect
    .poll(async () => (await destination.inputValue()).trim().length)
    .toBeGreaterThanOrEqual(6);

  await page.waitForTimeout(debouncePaddingMs);

  await expect(page.getByRole("status")).toContainText(/\d suggestion/i, {
    timeout: 20_000,
  });

  await destination.press("ArrowDown");

  await expect(
    page.getByRole("option", { name: /Dupont Circle/i }).first(),
  ).toBeVisible({
    timeout: 20_000,
  });

  await destination.press("ArrowDown");
  await page.keyboard.press("Enter");

  await routePosted;
}

/**
 * Asserts the focused MapLibre zoom button receives a `click` event when the
 * given key is pressed. We rely on MapLibre's documented contract for what
 * `click` does (zoom ±1) rather than re-testing the dependency here.
 *
 * Implementation note: the listener is installed synchronously and writes to
 * `data-scout-clicked` on the button itself, then we press the key and poll
 * the attribute. No test-only globals on `window`.
 */
async function expectKeyDispatchesClick(
  page: Page,
  name: "Zoom in" | "Zoom out",
  key: "Enter" | " ",
): Promise<void> {
  const button = page.getByRole("button", { name, exact: true });

  await button.evaluate((el) => {
    el.removeAttribute("data-scout-clicked");
    el.addEventListener(
      "click",
      () => {
        el.setAttribute("data-scout-clicked", "true");
      },
      { once: true },
    );
  });

  await page.keyboard.press(key);

  await expect(button).toHaveAttribute("data-scout-clicked", "true");
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

    await page.getByRole("link", { name: "Skip to list", exact: true }).focus();
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

test.describe("Planner address autocomplete (M1-F03)", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("scout.onboarded.v1", "true");
    });

    await scoutMockApis(page);
  });

  test("keyboard fills start and destination and the planner subtree passes axe", async ({
    page,
  }) => {
    await page.goto("/plan");

    await keyboardFillPlannerAddressesFromStubHits(page);

    const plannerAxe = await new AxeBuilder({ page })
      .include("#scout-route-planner")
      .analyze();

    expect(plannerAxe.violations).toStrictEqual([]);
  });
});

test.describe("Rendered walking route + summary text (M1-F05)", () => {
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.clear();
      localStorage.setItem("scout.onboarded.v1", "true");
    });

    await scoutMockApis(page);
  });

  test("route summary region shows mocked distance and walking time after both picks", async ({
    page,
  }) => {
    await page.goto("/plan");

    await keyboardFillPlannerAddressesFromStubHits(page);

    await expect(page.getByRole("region", { name: /route summary/i })).toBeVisible({
      timeout: 30_000,
    });

    const summaryCard = page.getByTestId("scout-route-summary");

    await expect(summaryCard).not.toContainText(
      /straight-line approximation while routing is unavailable/i,
    );

    await expect(summaryCard.getByText(/942\s+meters/i)).toBeVisible({
      timeout: 30_000,
    });

    await expect(summaryCard.getByText(/11\s+minutes/i)).toBeVisible({
      timeout: 30_000,
    });
  });

  test("full-page axe passes with mocked route geometry loaded", async ({ page }) => {
    await page.goto("/plan");

    await keyboardFillPlannerAddressesFromStubHits(page);

    await page.getByTestId("scout-route-summary").waitFor({ state: "visible" });

    const axeResults = await new AxeBuilder({ page }).analyze();
    expect(axeResults.violations).toStrictEqual([]);
  });

  test("reduced-motion prefers API distance in summary once route posts", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/plan");

    await keyboardFillPlannerAddressesFromStubHits(page);

    const summary = page.getByTestId("scout-route-summary");
    await expect(summary).toBeVisible();

    // Live region is overwritten by corridor copy ("Found N accessibility features…").
    await expect(summary).toContainText("942 meters");
  });

  test("mobile viewport stacks route summary landmark before map region @mobile", async ({
    page,
  }) => {
    await page.goto("/plan");

    await keyboardFillPlannerAddressesFromStubHits(page);

    // Narrow AFTER /plan settles so autocomplete popovers/interaction stay stable;
    // we only assert document order, not responsive reflow swaps.
    await page.setViewportSize({ width: 375, height: 812 });

    await expect(page.getByTestId("scout-route-summary")).toBeVisible();
    await expect(page.getByTestId("scout-basemap-region")).toBeVisible();

    const summaryPrecedesBasemapRegion = await page.evaluate(() => {
      const summary = document.querySelector('[data-testid="scout-route-summary"]');
      const basemapWrap = document.querySelector(
        '[data-testid="scout-basemap-region"]',
      );

      if (!summary || !basemapWrap) {
        return false;
      }

      /* `basemapWrap` follows `summary` when the bitmask includes FOLLOWING (=4). */
      const DOCUMENT_POSITION_FOLLOWING = 4;

      return (
        (summary.compareDocumentPosition(basemapWrap) & DOCUMENT_POSITION_FOLLOWING) !==
        0
      );
    });

    expect(summaryPrecedesBasemapRegion).toBe(true);

    const listPrecedesMapColumn = await page.evaluate(
      ([listSel, mapSel]) => {
        const list = document.querySelector(listSel);
        const map = document.querySelector(mapSel);

        if (!list || !map) {
          return false;
        }

        const DOCUMENT_POSITION_FOLLOWING = 4;
        return (list.compareDocumentPosition(map) & DOCUMENT_POSITION_FOLLOWING) !== 0;
      },
      ["#scout-route-list", "#scout-route-map-region"],
    );

    expect(listPrecedesMapColumn).toBe(true);

    const showMap = page.getByRole("button", { name: /^show map$/i });
    await expect(showMap).toBeVisible();

    await showMap.click();

    await expect(page.getByRole("button", { name: /^hide map$/i })).toBeVisible();
  });
});

test.describe(
  "interactive map zoom keyboard (M1-F02.S2)",
  { tag: "@interactive" },
  () => {
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
    });

    for (const name of ["Zoom in", "Zoom out"] as const) {
      test(`Tab reaches ${name} button`, async ({ page }) => {
        await tabUntilFocusedOn(page, name);

        await expect(page.getByRole("button", { name, exact: true })).toBeFocused();
      });
    }

    /*
     * MapLibre's NavigationControl is what binds button click -> zoom ±1; that
     * is its documented contract and not our integration to re-prove. What we
     * own is that the button is a real <button> element wired by MapLibre, so
     * Enter and Space activate it. Assert exactly that.
     */
    for (const name of ["Zoom in", "Zoom out"] as const) {
      for (const key of ["Enter", " "] as const) {
        const keyLabel = key === " " ? "Space" : key;
        test(`${keyLabel} on ${name} fires the button's click handler`, async ({
          page,
        }) => {
          await tabUntilFocusedOn(page, name);
          await expectKeyDispatchesClick(page, name, key);
        });
      }
    }
  },
);
