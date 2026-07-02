import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import Footer from "./Footer";

describe("<Footer/>", () => {
  it("passes axe", async () => {
    const { container } = render(<Footer />);
    expect((await axe(container)).violations).toStrictEqual([]);
  });

  it("renders a contentinfo landmark", () => {
    render(<Footer />);
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it.each<[string, string]>([
    ["About Scout", "/about"],
    ["Route planner", "/plan"],
    ["Privacy policy", "/privacy"],
    ["Accessibility statement", "/accessibility"],
    ["Source on GitHub", "https://github.com/RSid/scout"],
  ])("links %s to %s", (name, href) => {
    render(<Footer />);
    expect(screen.getByRole("link", { name }).getAttribute("href")).toBe(href);
  });

  it("names the footer navigation so screen readers can distinguish it", () => {
    render(<Footer />);
    expect(
      within(screen.getByRole("contentinfo")).getByRole("navigation", {
        name: "Footer",
      }),
    ).toBeInTheDocument();
  });
});
