import type { CorridorResponse, RouteSummaryPayload } from "@/lib/api";
import type { GeoJSON } from "geojson";

/** Deterministic corridor + route payloads for demos and playwright mocks. */

/**
 * First-load placeholder route: a real wheelchair-profile walking route from
 * "1000 MADISON DRIVE NW" (north edge of the National Mall) to "1201 G STREET
 * NW" (12th & G, downtown). Both endpoints come from the bundled DC MAR
 * snapshot (`data/dc_addresses.jsonl`, mar_id 313454 and 242928).
 *
 * The geometry was captured once from the OpenRouteService Directions API
 * (the same provider the live app uses) so the on-load example follows real
 * streets instead of a misleading straight line. ORS results are licensed
 * CC-BY 4.0; attribution is therefore required wherever this route is shown:
 *
 *   © openrouteservice.org by HeiGIT | Map data © OpenStreetMap contributors
 *
 * Frozen distance/duration live in `DEMO_ROUTE_SUMMARY` below.
 */
export const DEMO_ROUTE: GeoJSON.Feature<GeoJSON.LineString> = {
  id: "demo-route-mall-to-g-st",
  type: "Feature",
  geometry: {
    type: "LineString",
    coordinates: [
      [-77.026248, 38.890383],
      [-77.027836, 38.890359],
      [-77.027837, 38.890417],
      [-77.027836, 38.890428],
      [-77.027834, 38.890483],
      [-77.027832, 38.890525],
      [-77.027801, 38.890563],
      [-77.027806, 38.891709],
      [-77.027807, 38.891916],
      [-77.027827, 38.891915],
      [-77.02788, 38.891923],
      [-77.027929, 38.891931],
      [-77.027955, 38.891944],
      [-77.02792, 38.89198],
      [-77.027918, 38.892092],
      [-77.027915, 38.892204],
      [-77.027925, 38.892261],
      [-77.027931, 38.893059],
      [-77.027976, 38.893089],
      [-77.027972, 38.893394],
      [-77.027971, 38.893494],
      [-77.027972, 38.893697],
      [-77.027968, 38.894692],
      [-77.027889, 38.894766],
      [-77.027895, 38.89482],
      [-77.027902, 38.894888],
      [-77.027921, 38.895062],
      [-77.027928, 38.895133],
      [-77.027934, 38.895181],
      [-77.027996, 38.895228],
      [-77.028111, 38.895259],
      [-77.02817, 38.895277],
      [-77.028251, 38.895279],
      [-77.028216, 38.895322],
      [-77.028213, 38.895422],
      [-77.028213, 38.895895],
      [-77.028224, 38.896037],
      [-77.028227, 38.896067],
      [-77.028225, 38.89614],
      [-77.028221, 38.896218],
      [-77.028218, 38.896239],
      [-77.028205, 38.897239],
      [-77.028203, 38.897275],
      [-77.028204, 38.897356],
      [-77.028205, 38.897441],
      [-77.028205, 38.897473],
      [-77.028205, 38.897485],
      [-77.0282, 38.898203],
      [-77.028229, 38.898226],
      [-77.028225, 38.898255],
      [-77.028216, 38.898323],
      [-77.028207, 38.898394],
      [-77.028203, 38.898426],
      [-77.02839, 38.898426],
    ],
  },
  properties: { source: "openrouteservice", license: "CC-BY-4.0" },
};

/**
 * Frozen summary for {@link DEMO_ROUTE} (captured alongside the geometry).
 * Lets the first-load sample show honest distance/time instead of a
 * straight-line estimate.
 */
export const DEMO_ROUTE_SUMMARY: RouteSummaryPayload = {
  distanceMeters: 1089,
  durationSeconds: 731.4,
  fallbackProfileUsed: false,
  warnings: [],
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
