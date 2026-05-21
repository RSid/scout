import { axe } from "jest-axe";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { render, screen } from "@testing-library/react";

import ProfileCategoryFields from "./ProfileCategoryFields";

import type { ApiCategory } from "@/lib/api";

const SAMPLE: ApiCategory[] = [
  {
    id: "curb_ramps",
    label: "Curb ramps",
    description: "Sidewalk transitions.",
    kind: "aid",
    default_enabled: true,
  },
  {
    id: "narrow_paths",
    label: "Narrow sidewalks",
    description: "Tight choke points.",
    kind: "obstacle",
    default_enabled: false,
  },
];

describe("ProfileCategoryFields", () => {
  it("invokes toggle when checkboxes flip", async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();

    const { container } = render(
      <ProfileCategoryFields
        categories={SAMPLE}
        selections={{ curb_ramps: true, narrow_paths: false }}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /narrow sidewalks/i }));

    expect(onToggle).toHaveBeenCalledWith("narrow_paths", true);

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
