import { axe } from "jest-axe";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

  it("moves focus to the in-page target when activated from the keyboard", async () => {
    const user = userEvent.setup();
    render(
      <>
        <section id="scout-route-list" tabIndex={-1}>
          Route list
        </section>
        <SkipLink href="#scout-route-list" label="Skip to list" preset="flow" />
      </>,
    );

    const link = screen.getByRole("link", { name: "Skip to list" });
    await user.click(link);

    await waitFor(() => {
      expect(document.getElementById("scout-route-list")).toHaveFocus();
    });
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
