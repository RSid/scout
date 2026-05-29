import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import RouteCategorySummary from "./RouteCategorySummary";

import type { ApiCategory, CorridorResponse } from "@/lib/api";

// ---- Fixtures ----

const CAT_CURB: ApiCategory = {
  id: "curb_ramps",
  label: "Curb ramps",
  description: "ADA curb ramps.",
  kind: "obstacle",
  default_enabled: true,
};

const CAT_REST: ApiCategory = {
  id: "rest_spots",
  label: "Rest spots",
  description: "Benches.",
  kind: "aid",
  default_enabled: true,
};

const CAT_SIGNALS: ApiCategory = {
  id: "audible_signals",
  label: "Audible pedestrian signals",
  description: "Signals.",
  kind: "aid",
  default_enabled: true,
};

function makeFeature(
  categoryId: string,
  id: string,
): CorridorResponse["features"][number] {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-77.03, 38.9] },
    properties: { category: categoryId, id },
    id,
  } as unknown as CorridorResponse["features"][number];
}

const ALL_CATEGORIES = [CAT_CURB, CAT_REST, CAT_SIGNALS];

const SAMPLE_FEATURES = [
  makeFeature("curb_ramps", "f1"),
  makeFeature("curb_ramps", "f2"),
  makeFeature("curb_ramps", "f3"),
  makeFeature("rest_spots", "f4"),
  makeFeature("rest_spots", "f5"),
];

// ---- Helpers ----

function renderStrip(
  overrides: Partial<React.ComponentProps<typeof RouteCategorySummary>> = {},
) {
  const onFilterChange = vi.fn();
  const onMapVisibilityChange = vi.fn();
  render(
    <RouteCategorySummary
      features={SAMPLE_FEATURES}
      categories={ALL_CATEGORIES}
      filterCategoryId={null}
      onFilterChange={onFilterChange}
      hiddenCategoryIds={new Set()}
      onMapVisibilityChange={onMapVisibilityChange}
      {...overrides}
    />,
  );
  return { onFilterChange, onMapVisibilityChange };
}

// ---- Tests ----

describe("RouteCategorySummary", () => {
  it("renders a Supports group and an Obstacles group", () => {
    renderStrip();
    expect(screen.getByRole("group", { name: "Supports" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Obstacles" })).toBeInTheDocument();
  });

  it("shows only categories that have ≥1 feature — audible_signals has 0, so no chip", () => {
    renderStrip();
    // Rest spots and curb ramps have features; audible_signals does not.
    expect(screen.getByLabelText(/2 rest spots along this route/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/3 curb ramps along this route/i)).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/audible pedestrian signals/i),
    ).not.toBeInTheDocument();
  });

  it("returns null when no features are passed", () => {
    const { container } = render(
      <RouteCategorySummary
        features={[]}
        categories={ALL_CATEGORIES}
        filterCategoryId={null}
        onFilterChange={vi.fn()}
        hiddenCategoryIds={new Set()}
        onMapVisibilityChange={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  describe("counts", () => {
    it.each([
      ["curb_ramps", "Curb ramps", 3],
      ["rest_spots", "Rest spots", 2],
    ])("category %s shows count %i in its aria-label", (id, label, count) => {
      renderStrip();
      expect(
        screen.getByLabelText(`${String(count)} ${label} along this route`),
      ).toBeInTheDocument();
    });
  });

  describe("filter button (aria-pressed toggling)", () => {
    it("starts with aria-pressed=false when filterCategoryId is null", () => {
      renderStrip();
      const filterBtn = screen.getByLabelText("3 Curb ramps along this route");
      expect(filterBtn).toHaveAttribute("aria-pressed", "false");
    });

    it("has aria-pressed=true for the active filter", () => {
      renderStrip({ filterCategoryId: "curb_ramps" });
      const filterBtn = screen.getByLabelText("3 Curb ramps along this route");
      expect(filterBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("calls onFilterChange(id) on first press", async () => {
      const { onFilterChange } = renderStrip();
      await userEvent.click(screen.getByLabelText("3 Curb ramps along this route"));
      expect(onFilterChange).toHaveBeenCalledWith("curb_ramps");
    });

    it("calls onFilterChange(null) on second press (clear active filter)", async () => {
      const { onFilterChange } = renderStrip({ filterCategoryId: "curb_ramps" });
      await userEvent.click(screen.getByLabelText("3 Curb ramps along this route"));
      expect(onFilterChange).toHaveBeenCalledWith(null);
    });
  });

  describe("visibility button", () => {
    it("shows eye-open state (aria-pressed=false) when category is visible", () => {
      renderStrip();
      const visBtn = screen.getByLabelText("Hide Curb ramps from map; 3 along route");
      expect(visBtn).toHaveAttribute("aria-pressed", "false");
    });

    it("shows eye-off state (aria-pressed=true) when category is hidden", () => {
      renderStrip({ hiddenCategoryIds: new Set(["curb_ramps"]) });
      const visBtn = screen.getByLabelText("Show Curb ramps on map; 3 along route");
      expect(visBtn).toHaveAttribute("aria-pressed", "true");
    });

    it("calls onMapVisibilityChange(id, false) to hide a visible category", async () => {
      const { onMapVisibilityChange } = renderStrip();
      await userEvent.click(
        screen.getByLabelText("Hide Curb ramps from map; 3 along route"),
      );
      expect(onMapVisibilityChange).toHaveBeenCalledWith("curb_ramps", false);
    });

    it("calls onMapVisibilityChange(id, true) to reveal a hidden category", async () => {
      const { onMapVisibilityChange } = renderStrip({
        hiddenCategoryIds: new Set(["curb_ramps"]),
      });
      await userEvent.click(
        screen.getByLabelText("Show Curb ramps on map; 3 along route"),
      );
      expect(onMapVisibilityChange).toHaveBeenCalledWith("curb_ramps", true);
    });
  });

  describe("keyboard tab order", () => {
    it("Supports group precedes Obstacles group in tab order", () => {
      renderStrip();
      const supportsGroup = screen.getByRole("group", { name: "Supports" });
      const obstaclesGroup = screen.getByRole("group", { name: "Obstacles" });

      // compareDocumentPosition bit 4 = DOCUMENT_POSITION_FOLLOWING
      expect(supportsGroup.compareDocumentPosition(obstaclesGroup)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });

    it("within a chip, filter button precedes visibility button in DOM order", () => {
      renderStrip();
      const obstaclesGroup = screen.getByRole("group", { name: "Obstacles" });
      const filterBtn = within(obstaclesGroup).getByLabelText(
        "3 Curb ramps along this route",
      );
      const visBtn = within(obstaclesGroup).getByLabelText(
        "Hide Curb ramps from map; 3 along route",
      );
      expect(filterBtn.compareDocumentPosition(visBtn)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING,
      );
    });
  });

  it("passes axe with no violations", async () => {
    const { container } = render(
      <RouteCategorySummary
        features={SAMPLE_FEATURES}
        categories={ALL_CATEGORIES}
        filterCategoryId={null}
        onFilterChange={vi.fn()}
        hiddenCategoryIds={new Set()}
        onMapVisibilityChange={vi.fn()}
      />,
    );
    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
