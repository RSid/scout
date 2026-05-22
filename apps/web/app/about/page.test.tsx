import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AboutPage from "./page";
import { DATA_SOURCES, isInspectionOutdated } from "@/lib/data-sources";
import { DISCLAIMER_L1_COPY } from "@/lib/disclaimer-copy";

describe("inspection staleness heuristic", () => {
  it.each<[number | null, number, boolean]>([
    [2016, 2026, true],
    [2023, 2026, false],
    [null, 2026, false],
  ])(
    "year %s vs reference %s → outdated? %s",
    (datasetYear, referenceYear, expected) => {
      expect(isInspectionOutdated(datasetYear, referenceYear)).toBe(expected);
    },
  );
});

describe("<AboutPage/>", () => {
  it("passes axe", async () => {
    const { container } = render(<AboutPage />);
    expect((await axe(container)).violations).toStrictEqual([]);
  });

  it("keeps exactly one heading at level one", () => {
    render(<AboutPage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("uses aria-labelledby tying the disclaimer landmark to its visible heading", () => {
    render(<AboutPage />);
    const landmark = screen.getByRole("region", { name: /^about scout's data$/i });
    expect(landmark.getAttribute("aria-labelledby")).toBe("disclaimer-heading");
    expect(landmark).toHaveAttribute("id", "disclaimer");

    expect(
      within(landmark).getByRole("heading", { level: 2, name: "About Scout's data" })
        .id,
    ).toBe("disclaimer-heading");
  });

  it("includes the L1 disclaimer copy verbatim inside the disclaimer region", () => {
    render(<AboutPage />);
    const landmark = screen.getByRole("region", { name: /^about scout's data$/i });
    expect(landmark).toHaveTextContent(DISCLAIMER_L1_COPY);
  });

  it("lists outbound links matching every curated dataset entry", () => {
    render(<AboutPage />);
    DATA_SOURCES.forEach(({ label, url }) => {
      expect(screen.getByRole("link", { name: label }).getAttribute("href")).toBe(url);
    });
  });

  it("surfaces appendix §D freshness chips for stale DC snapshots", () => {
    render(<AboutPage />);
    const chips = screen.getAllByTestId("freshness-chip");
    expect(chips.length > 0).toBeTruthy();
    expect(
      chips.every((chip) => chip.textContent?.startsWith("Data may be outdated")),
    ).toBe(true);
  });

  it("labels unknown inspection timelines on API-only overlays", () => {
    render(<AboutPage />);
    expect(
      screen.getAllByText("Inspection date unknown").length,
    ).toBeGreaterThanOrEqual(
      DATA_SOURCES.filter((row) => row.lastInspectedYear === null).length,
    );
  });

  it("suppresses headings beyond h2 besides the solitary h1", () => {
    render(<AboutPage />);
    expect(document.querySelectorAll("h3").length).toBe(0);
  });
});
