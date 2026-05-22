import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SkipLink from "./a11y/SkipLink";

describe("SkipLink", () => {
  it("anchors to the main landmark by default", async () => {
    const { container } = render(<SkipLink />);
    expect(screen.getByRole("link", { name: /skip to main/i })).toHaveAttribute(
      "href",
      "#main",
    );

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  it("accepts flow presets so section-local skips reuse the landmark styling", async () => {
    const href = "#scout-route-list";
    const label = "Skip map";
    const { container } = render(<SkipLink href={href} label={label} preset="flow" />);

    expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
    expect(container.querySelector("div.relative")).not.toBeNull();

    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
