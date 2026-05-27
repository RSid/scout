import type { CorridorResponse } from "@/lib/api";
import type { GeoJSON } from "geojson";

/** Deterministic corridor + route payloads for demos and playwright mocks. */

export const DEMO_ROUTE: GeoJSON.Feature<GeoJSON.LineString> = {
  id: "demo-route",
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [-77.0415, 38.895],
      [-77.0312, 38.9074],
      [-77.0122, 38.9175],
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
