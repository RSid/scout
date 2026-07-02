import { axe } from "jest-axe";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import AboutPage from "./page";
import { DATA_SOURCES, isInspectionOutdated } from "@/lib/data-sources";

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
    expect(chips.every((chip) => chip.textContent?.startsWith("Last inspected"))).toBe(
      true,
    );
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
