import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import StatusStrip, { type StatusSeverity } from "./StatusStrip";

describe("StatusStrip", () => {
  it("renders the title and the optional detail", () => {
    render(
      <StatusStrip
        severity="warning"
        title="Directions unavailable"
        detail="Try again soon."
      />,
    );

    expect(screen.getByText("Directions unavailable")).toBeVisible();
    expect(screen.getByText("Try again soon.")).toBeVisible();
  });

  it("omits the detail paragraph when no detail is provided", () => {
    render(<StatusStrip severity="info" title="Pick a start and a destination" />);

    expect(screen.getByText("Pick a start and a destination")).toBeVisible();
  });

  it.each<StatusSeverity>(["info", "pending", "warning", "error"])(
    "passes axe with no violations for the %s severity",
    async (severity) => {
      const { container } = render(
        <StatusStrip
          severity={severity}
          title="Status title"
          detail="Status detail."
        />,
      );

      const results = await axe(container);
      expect(results.violations).toStrictEqual([]);
    },
  );
});
