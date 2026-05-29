import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import PrivacyPage from "./page";

describe("<PrivacyPage/>", () => {
  it("passes axe", async () => {
    const { container } = render(<PrivacyPage />);
    expect((await axe(container)).violations).toStrictEqual([]);
  });

  it("keeps exactly one heading at level one", () => {
    render(<PrivacyPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("offers a contact channel for privacy questions", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Privacy questions" }),
    ).toBeInTheDocument();
  });

  it("points privacy questions at the public GitHub issue tracker", () => {
    render(<PrivacyPage />);
    expect(
      screen.getByRole("link", { name: "Open a GitHub issue" }).getAttribute("href"),
    ).toBe("https://github.com/RSid/scout/issues");
  });
});
