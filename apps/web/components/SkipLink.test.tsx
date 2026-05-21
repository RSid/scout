import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import SkipLink from "./a11y/SkipLink";

describe("SkipLink", () => {
  it("anchors to main landmark", async () => {
    const { container } = render(<SkipLink />);
    expect(screen.getByRole("link", { name: /skip to main/i })).toHaveAttribute("href", "#main");
    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });
});
