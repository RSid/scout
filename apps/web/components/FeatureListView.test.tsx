import { axe } from "jest-axe";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import FeatureListView from "./FeatureListView";

import type { ApiCategory, CorridorResponse } from "@/lib/api";

const categories: ApiCategory[] = [
  {
    id: "curb_ramps",
    label: "Curb ramps",
    description: "Sidewalk transitions near crossings.",
    kind: "obstacle",
    default_enabled: true,
  },
];

vi.mock("@/lib/profile", () => ({
  useProfile: () => ({
    categories,
    selections: {},
    toggle: (): void => undefined,
    resetToDefaults: (): void => undefined,
    persist: (): void => undefined,
    refreshRemote: async (): Promise<void> => undefined,
    isReady: true,
  }),
}));

vi.mock("@/lib/map/markers", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/map/markers")>();
  return {
    ...actual,
    scoutMarkerTintedSvgDataUriBatch: vi.fn(async () => {
      const out = new Map<string, string>();
      const key = actual.scoutMarkerIconId("curb_ramps", "mild");
      out.set(
        key,
        `data:image/svg+xml,${encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg'/>")}`,
      );
      return out;
    }),
  };
});

function corridorPoint(
  props: Record<string, unknown>,
): CorridorResponse["features"][number] {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [-77.032, 38.907] },
    properties: props as CorridorResponse["features"][number]["properties"],
  };
}

describe("FeatureListView", () => {
  it("shows along-route meter summary and emits Open on map with the corridor id", async () => {
    const user = userEvent.setup({ delay: null });

    const onShow = vi.fn();

    const { container } = render(
      <FeatureListView
        features={[
          corridorPoint({
            id: "scout:list-hit",
            category: "curb_ramps",
            kind: "obstacle",
            condition: "Good",
            condition_normalized: "good",
            inspected_year: 2021,
            along_route_meters: 211.25,
          }),
        ]}
        listingStatus="ready"
        selectedFeatureId={null}
        onShowOnMap={onShow}
      />,
    );

    await screen.findByRole("heading", { name: /^Along your route/ });

    expect(screen.getAllByText(/~\s*211(\.3)? meters from start/i)[0]).toBeVisible();

    await user.click(screen.getByRole("button", { name: /^Open on map$/i }));

    expect(onShow).toHaveBeenCalledTimes(1);
    expect(onShow).toHaveBeenCalledWith("scout:list-hit");

    const axeResults = await axe(container);

    expect(axeResults.violations).toStrictEqual([]);
  });

  it("shows empty DEC-021 copy when corridor rows are Ready but empty", () => {
    render(
      <FeatureListView
        features={[]}
        listingStatus="ready"
        selectedFeatureId={null}
        onShowOnMap={() => {}}
      />,
    );

    expect(
      screen.getByText((text) => text.includes("Nothing along this route")),
    ).toBeVisible();
  });

  it("shows outdated chip inside expanded rows when inspection year crosses §7.8", async () => {
    const user = userEvent.setup({ delay: null });

    const { container } = render(
      <FeatureListView
        features={[
          corridorPoint({
            id: "scout:stale",
            category: "curb_ramps",
            kind: "obstacle",
            condition: "Fair",
            condition_normalized: "difficult",
            inspected_year: 2016,
            along_route_meters: 105.8,
          }),
        ]}
        listingStatus="ready"
        selectedFeatureId={null}
        onShowOnMap={() => {}}
      />,
    );

    const summary = container.querySelector("summary");
    expect(summary).not.toBeNull();
    await user.click(summary as HTMLElement);

    expect(await screen.findByTestId("freshness-chip")).toHaveTextContent(
      /Last inspected 2016/,
    );
  });

  it("renders exactly one details row per corridor point feature", async () => {
    const { container } = render(
      <FeatureListView
        features={[
          corridorPoint({
            id: "a",
            category: "curb_ramps",
            kind: "obstacle",
            condition: "Good",
            condition_normalized: "good",
            inspected_year: 2021,
            along_route_meters: 10,
          }),
          corridorPoint({
            id: "b",
            category: "curb_ramps",
            kind: "obstacle",
            condition: "Fair",
            condition_normalized: "difficult",
            inspected_year: 2021,
            along_route_meters: 40,
          }),
        ]}
        listingStatus="ready"
        selectedFeatureId={null}
        onShowOnMap={() => {}}
      />,
    );

    await screen.findByRole("heading", { name: /^Along your route/ });

    expect(container.querySelectorAll("details")).toHaveLength(2);
  });

  it("labels a missing inspection year rather than printing a placeholder number", async () => {
    const user = userEvent.setup({ delay: null });

    const { container } = render(
      <FeatureListView
        features={[
          corridorPoint({
            id: "scout:no-year",
            category: "curb_ramps",
            kind: "obstacle",
            condition: "Good",
            condition_normalized: "good",
            inspected_year: null,
            along_route_meters: 12,
          }),
        ]}
        listingStatus="ready"
        selectedFeatureId={null}
        onShowOnMap={() => {}}
      />,
    );

    await user.click(container.querySelector("summary") as HTMLElement);

    expect(await screen.findByText(/inspection date unknown/i)).toBeInTheDocument();
  });

  it("excludes features whose category lacks map marker support", async () => {
    const { container } = render(
      <FeatureListView
        features={[
          corridorPoint({
            id: "supported",
            category: "curb_ramps",
            kind: "obstacle",
            condition: "Good",
            condition_normalized: "good",
            inspected_year: 2021,
            along_route_meters: 10,
          }),
          corridorPoint({
            id: "unsupported",
            category: "bus_stops",
            kind: "aid",
            condition: "Present",
            condition_normalized: "good",
            inspected_year: 2021,
            along_route_meters: 20,
          }),
        ]}
        listingStatus="ready"
        selectedFeatureId={null}
        onShowOnMap={() => {}}
      />,
    );

    await screen.findByRole("heading", { name: /^Along your route/ });

    expect(container.querySelectorAll("details")).toHaveLength(1);
    expect(screen.getAllByText(/Curb ramps/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/bus_stops/i)).not.toBeInTheDocument();
  });

  it("renders refuge restroom notes as plain text, never as HTML", async () => {
    const user = userEvent.setup({ delay: null });

    const { container } = render(
      <FeatureListView
        features={[
          corridorPoint({
            id: "scout:restroom",
            category: "restrooms",
            kind: "aid",
            condition: "Accessible",
            condition_normalized: "good",
            inspected_year: 2022,
            source_dataset: "refugerestrooms",
            along_route_meters: 20,
            attributes: { notes: "<img src=x onerror=alert(1)>Ramp at side door" },
          }),
        ]}
        listingStatus="ready"
        selectedFeatureId={null}
        onShowOnMap={() => {}}
      />,
    );

    await user.click(container.querySelector("summary") as HTMLElement);

    // The raw string is shown verbatim; no <img> element is injected.
    expect(
      await screen.findByText(/<img src=x onerror=alert\(1\)>Ramp at side door/),
    ).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
  });
});
