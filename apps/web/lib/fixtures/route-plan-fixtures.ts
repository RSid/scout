import type { CorridorResponse } from "@/lib/api";
import type { GeoJSON } from "geojson";

/** Deterministic corridor + route payloads for demos and playwright mocks. */

/**
 * First-load placeholder: straight line from "1000 MADISON DRIVE NW" (north
 * edge of the National Mall) to "1201 G STREET NW" (12th & G, downtown). Both
 * coordinates come straight from the bundled DC MAR snapshot
 * (`data/dc_addresses.jsonl`, mar_id 313454 and 242928 respectively), so the
 * line resolves to two real walkable addresses and the corridor query around
 * it produces a representative slice of downtown DC features.
 */
export const DEMO_ROUTE: GeoJSON.Feature<GeoJSON.LineString> = {
  id: "demo-route-mall-to-g-st",
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [-77.02624344, 38.89020747],
      [-77.02839035, 38.89851941],
    ],
  },
  properties: { fallback: true },
};

export function demoCorridorFeatures(): CorridorResponse["features"] {
  return [
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [-77.034, 38.903],
      },
      properties: {
        id: "demo:feat-1",
        category: "curb_ramps",
        kind: "obstacle",
        condition: "Good",
        condition_normalized: "good",
        along_route_meters: 120.5,
        inspected_year: 2021,
        source_dataset: "demo",
        source_id: "1",
        attributes: {},
      },
    },
    {
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [-77.022, 38.913],
      },
      properties: {
        id: "demo:feat-2",
        category: "rest_spots",
        kind: "aid",
        condition: "Fair",
        condition_normalized: "fair",
        along_route_meters: 842.4,
        inspected_year: 2020,
        source_dataset: "demo",
        source_id: "2",
        attributes: {},
      },
    },
  ];
}
