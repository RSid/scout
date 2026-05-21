import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LiveRegion from "./a11y/LiveRegion";

describe("LiveRegion", () => {
  it("hosts polite status updates accessibly", async () => {
    const { container } = render(<LiveRegion message="Features refreshed." />);

    expect(screen.getByRole("status", { hidden: false })).toHaveTextContent(
      "Features refreshed.",
    );

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
