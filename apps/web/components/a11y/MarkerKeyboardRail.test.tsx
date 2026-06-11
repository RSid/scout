import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import MarkerKeyboardRail from "./MarkerKeyboardRail";

import type { ApiCategory, CorridorResponse } from "@/lib/api";

const categories: ApiCategory[] = [
  {
    id: "curb_ramps",
    label: "Curb ramps",
    description: "",
    kind: "obstacle",
    default_enabled: true,
  },
];

const catById = new Map<string, ApiCategory>(
  categories.map((row) => [row.id, row] as const),
);

function corridorPoint(
  condition: string,
  row: number,
): CorridorResponse["features"][number] {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-77.032 + row * 0.001, 38.907] },
    properties: {
      id: `rail-${String(row)}`,
      category: "curb_ramps",
      kind: "obstacle",
      condition,
      inspected_year: 2019,
      source_dataset: "demo",
      source_id: String(row),
    },
  };
}

describe("MarkerKeyboardRail", () => {
  it("exposes Enter on the rail while keeping markup screen-reader only", async () => {
    const user = userEvent.setup({ delay: null });

    const focusedChange = vi.fn();
    const onActivateRow = vi.fn();

    const { rerender } = render(
      <MarkerKeyboardRail
        categoryById={catById}
        features={[corridorPoint("Good", 0), corridorPoint("Poor", 1)]}
        focusedIndex={0}
        onFocusedIndexChange={focusedChange}
        onActivateRow={onActivateRow}
      />,
    );

    const buttons = (): HTMLElement[] =>
      screen.getAllByRole("button", { hidden: true }) as HTMLElement[];

    expect(
      screen.getByText(/Use arrow keys inside this list/).parentElement,
    ).toHaveClass("sr-only");
    expect(buttons()[0]?.tabIndex).toBe(0);
    expect(buttons()[1]?.tabIndex).toBe(-1);

    buttons()[0]?.focus();
    await user.keyboard("{Enter}");

    expect(onActivateRow).toHaveBeenCalledWith(0);

    rerender(
      <MarkerKeyboardRail
        categoryById={catById}
        features={[corridorPoint("Good", 0), corridorPoint("Poor", 1)]}
        focusedIndex={1}
        onFocusedIndexChange={focusedChange}
        onActivateRow={onActivateRow}
      />,
    );

    expect(buttons()[1]?.tabIndex).toBe(0);
    expect(buttons()[0]?.tabIndex).toBe(-1);

    buttons()[1]?.focus();
    await user.keyboard("{Enter}");
    expect(onActivateRow).toHaveBeenCalledWith(1);
  });
});
