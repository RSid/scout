import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import RouteSummary from "./RouteSummary";

describe("RouteSummary", () => {
  it("shows distance with warnings", async () => {
    const { container } = render(
      <RouteSummary distanceLabel="~850 meters" warnings={["Slope may vary."]} />,
    );

    expect(screen.getByText("~850 meters")).toBeInTheDocument();

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
