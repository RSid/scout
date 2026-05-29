import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AccessibilityPage from "./page";

describe("<AccessibilityPage/>", () => {
  it("passes axe", async () => {
    const { container } = render(<AccessibilityPage />);
    expect((await axe(container)).violations).toStrictEqual([]);
  });

  it("keeps exactly one heading at level one", () => {
    render(<AccessibilityPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it.each([
    "What Scout aims for",
    "How that gets checked",
    "Where the decisions live",
    "Report a barrier",
    "Dates",
  ])("renders the %s section heading", (name) => {
    render(<AccessibilityPage />);
    expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
  });

  it("names the conformance standard and version", () => {
    render(<AccessibilityPage />);
    expect(screen.getByText(/WCAG 2\.2 Level AA/)).toBeInTheDocument();
  });

  it("routes barrier reports to the accessibility issue template, not security", () => {
    render(<AccessibilityPage />);
    expect(
      screen
        .getByRole("link", { name: "Open an accessibility report on GitHub" })
        .getAttribute("href"),
    ).toBe(
      "https://github.com/RSid/scout/issues/new?template=accessibility-barrier.yml",
    );
  });

  it("states the manual audit is still pending", () => {
    render(<AccessibilityPage />);
    expect(screen.getByText(/the first manual review is pending/)).toBeInTheDocument();
  });

  it("shows a page-review date distinct from the audit date", () => {
    render(<AccessibilityPage />);
    expect(screen.getByText(/Page last reviewed:/)).toBeInTheDocument();
  });
});
