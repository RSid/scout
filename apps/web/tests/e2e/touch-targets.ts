/** WCAG 2.5.5 — minimum 44×44 CSS px for planner interactive targets (M1-F14). */
export const TOUCH_TARGET_MIN_PX = 44;

export type TouchTargetMeasurement = Readonly<{
  name: string;
  width: number;
  height: number;
}>;

/**
 * Returns visible interactive elements whose layout box is smaller than
 * {@link TOUCH_TARGET_MIN_PX} on either axis.
 */
export async function findUndersizedTouchTargets(
  page: import("@playwright/test").Page,
): Promise<TouchTargetMeasurement[]> {
  return page.evaluate((minPx) => {
    const selectors = [
      "button:not([disabled])",
      "a[href]",
      '[role="button"]:not([aria-disabled="true"])',
      '[role="checkbox"]',
      '[role="combobox"]',
      "input:not([type='hidden']):not([disabled])",
      "summary",
    ].join(",");

    const seen = new Set<Element>();

    return Array.from(document.querySelectorAll<HTMLElement>(selectors))
      .filter((el) => {
        if (seen.has(el)) {
          return false;
        }
        seen.add(el);

        const style = window.getComputedStyle(el);
        if (style.display === "none" || style.visibility === "hidden") {
          return false;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
          return false;
        }

        return rect.width < minPx || rect.height < minPx;
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        const name =
          el.getAttribute("aria-label") ??
          el.getAttribute("name") ??
          el.textContent?.trim().slice(0, 48) ??
          el.tagName.toLowerCase();

        return {
          name,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });
  }, TOUCH_TARGET_MIN_PX);
}

export async function assertNoHorizontalOverflow(
  page: import("@playwright/test").Page,
  viewportWidth: number,
): Promise<void> {
  const overflow = await page.evaluate((vw) => {
    const scrollWidth = Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    );
    return scrollWidth > vw;
  }, viewportWidth);

  if (overflow) {
    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    throw new Error(
      `Horizontal overflow at ${viewportWidth}px viewport: ${JSON.stringify(widths)}`,
    );
  }
}
