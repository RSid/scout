import { axe } from "jest-axe";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import DisclaimerBanner from "./DisclaimerBanner";
import { DISCLAIMER_L2_COPY, DISCLAIMER_L2_LINK_TEXT } from "@/lib/disclaimer-copy";
import { BANNER_DISMISSED_KEY } from "@/lib/disclaimer-banner-storage";

describe("DisclaimerBanner", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("meets axe checks for landmark content", async () => {
    const { container } = render(<DisclaimerBanner />);
    expect((await axe(container)).violations).toStrictEqual([]);
  });

  it("renders the L2 disclaimer copy from disclaimer-copy.ts", () => {
    render(<DisclaimerBanner />);
    expect(screen.getByRole("complementary")).toHaveTextContent(DISCLAIMER_L2_COPY);
  });

  it("links to the About page with self-describing text", () => {
    render(<DisclaimerBanner />);
    const link = screen.getByRole("link", { name: DISCLAIMER_L2_LINK_TEXT });
    expect(link.getAttribute("href")).toBe("/about");
  });

  it("hides itself after the dismiss button is activated", () => {
    render(<DisclaimerBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Hide this notice" }));
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("persists dismissal to sessionStorage for the session", () => {
    render(<DisclaimerBanner />);
    fireEvent.click(screen.getByRole("button", { name: "Hide this notice" }));
    expect(sessionStorage.getItem(BANNER_DISMISSED_KEY)).toBe("true");
  });

  it("stays hidden on remount when sessionStorage already records dismissal", () => {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, "true");
    render(<DisclaimerBanner />);
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
