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

    await page.getByRole("heading", { name: /plan a walking route/i }).waitFor();

    await tabUntilComboboxFocused(page, /starting point/i);

    const start = page.getByRole("combobox", { name: /starting point/i });

    await start.type("14th", { delay: 0 });

    await expect
      .poll(async () => (await start.inputValue()).trim().length)
      .toBeGreaterThanOrEqual(4);

    // AddressAutocomplete debounces backend/stub lookups (DEBOUNCE_MS=500).
    await expect(page.getByRole("status")).toContainText(/\d suggestion/i, {
      timeout: 15_000,
    });

    await start.press("ArrowDown");

    await expect(page.getByRole("option", { name: /1400 U Street/i })).toBeVisible({
      timeout: 15_000,
    });

    // Stub returns two hits ("1400 U Street…" before "Dupont Circle…"); one ArrowDown
    // selects the highlighted row—skip the extra ArrowDown or Enter commits Dupont.
    await page.keyboard.press("Enter");

    await expect
      .poll(async () =>
        (await start.inputValue()).toLowerCase().includes("1400 u street"),
      )
      .toBe(true);

    await tabUntilComboboxFocused(page, /destination/i);

    const destination = page.getByRole("combobox", { name: /destination/i });

    await destination.type("Dupont", { delay: 0 });

    await expect
      .poll(async () => (await destination.inputValue()).trim().length)
      .toBeGreaterThanOrEqual(6);

    await expect(page.getByRole("status")).toContainText(/\d suggestion/i, {
      timeout: 15_000,
    });

    await destination.press("ArrowDown");

    await expect(page.getByRole("option", { name: /Dupont Circle/i })).toBeVisible({
      timeout: 15_000,
    });

    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    await expect
      .poll(async () =>
        (await destination.inputValue()).toLowerCase().includes("dupont circle"),
      )
      .toBe(true);

    const plannerAxe = await new AxeBuilder({ page })
      .include("#scout-route-planner")
      .analyze();

    expect(plannerAxe.violations).toStrictEqual([]);
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
});
