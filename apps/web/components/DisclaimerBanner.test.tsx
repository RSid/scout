import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import DisclaimerBanner from "./DisclaimerBanner";

describe("DisclaimerBanner", () => {
  it("meets axe checks for landmark content", async () => {
    const { container } = render(<DisclaimerBanner />);
    const results = await axe(container);
    expect(results.violations).toStrictEqual([]);
  });

  it("links crowdsourcing disclosure", () => {
    render(<DisclaimerBanner />);
    expect(
      screen.getByRole("link", { name: /read the crowdsourcing disclaimer/i }),
    ).toBeInTheDocument();
  });
});
