/**
 * MapLibre basemap style construction (M1-F02, M2-F25).
 *
 * Extracted from `BasemapInner` so the style can be unit-tested without a WebGL
 * context: the glyph-URL and street-label wiring have invariants (self-hosted
 * fonts per NF-PRIV-01, ≥3:1 label contrast per NF-A11Y) worth asserting in
 * isolation from the map lifecycle.
 */

import type {
  ExpressionSpecification,
  StyleSpecification,
  SymbolLayerSpecification,
} from "maplibre-gl";
import { noLabels } from "protomaps-themes-base";

/** Vector source id for the local Protomaps `.pmtiles` DC extract. */
export const BASEMAP_SOURCE_ID = "scout_dc_basemap";

/**
 * Self-hosted SDF glyph endpoint (DEC-028). Relative, same-origin URL — the
 * PBF ranges live under `apps/web/public/fonts/glyphs/` and are fetched at
 * setup time by `scripts/fetch_map_glyphs.sh`. Never a third-party CDN
 * (`protomaps.github.io`, Mapbox, Google): those leak client IPs, which
 * NF-PRIV-01 / DEC-018 forbid.
 */
export const BASEMAP_GLYPHS_URL = "/fonts/glyphs/{fontstack}/{range}.pbf";

/**
 * The one fontstack we ship glyphs for. Matches the `text-font` the Protomaps
 * theme uses by default, so a single OFL Noto Sans Regular range set covers
 * every label we render.
 */
const STREET_LABEL_FONT = "Noto Sans Regular";

/** The `roads` source-layer carries road geometry + `name` in the extract. */
const ROADS_SOURCE_LAYER = "roads";

/**
 * Label colors chosen for ≥3:1 contrast against the Protomaps earth fill in
 * each scheme (NF-A11Y). The theme's own road-label grays (~#93939f / #999999)
 * sit below 3:1 on the light earth, so we override with a near-ink / near-paper
 * pair and lean on a full-opacity halo in the opposite tone for legibility over
 * varied fills. Color is never the sole signal here — labels are plain text.
 */
const LABEL_STYLE = {
  light: { text: "#26221f", halo: "#f5f3ef" },
  dark: { text: "#ececec", halo: "#141414" },
} as const;

/**
 * Street-name symbol layers sourced from the basemap's own `roads` layer
 * (DEC-028). Major roads label from z11, minor roads from z15 — the Protomaps
 * defaults — so the map is never crowded at city zoom yet names appear as the
 * user closes in on a corridor. Labels are decorative duplicates of the
 * already-accessible `<FeatureListView/>` / popup text and live on the WebGL
 * canvas, outside the a11y tree.
 */
function streetLabelLayers(scheme: "light" | "dark"): SymbolLayerSpecification[] {
  const { text, halo } = LABEL_STYLE[scheme];
  const textField: ExpressionSpecification = ["coalesce", ["get", "name"], ""];

  const shared = {
    source: BASEMAP_SOURCE_ID,
    "source-layer": ROADS_SOURCE_LAYER,
    type: "symbol",
    layout: {
      "symbol-placement": "line",
      "text-font": [STREET_LABEL_FONT],
      "text-field": textField,
      "text-size": 12,
    },
    paint: {
      "text-color": text,
      "text-halo-color": halo,
      "text-halo-width": 1.5,
    },
  } satisfies Partial<SymbolLayerSpecification>;

  return [
    {
      ...shared,
      id: "scout-street-labels-major",
      minzoom: 11,
      filter: ["in", "kind", "highway", "major_road"],
    },
    {
      ...shared,
      id: "scout-street-labels-minor",
      minzoom: 15,
      filter: ["in", "kind", "minor_road", "other", "path"],
    },
  ];
}

/**
 * Build the MapLibre style for the local DC basemap.
 *
 * `prefersDarkScheme` honors `prefers-color-scheme` (the caller reads the media
 * query). Static labels have no per-feature motion, so `prefers-reduced-motion`
 * needs no style-level change here — the map's motion is gated at the call
 * sites that animate the camera.
 */
export function buildDcBasemapStyle(prefersDarkScheme: boolean): StyleSpecification {
  const scheme = prefersDarkScheme ? "dark" : "light";
  const layers = noLabels(BASEMAP_SOURCE_ID, scheme);

  return {
    version: 8,
    glyphs: BASEMAP_GLYPHS_URL,
    sources: {
      [BASEMAP_SOURCE_ID]: {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a> (Open Database License). Tiles via Protomaps.',
        type: "vector",
        url: "pmtiles:///tiles/dc.pmtiles",
      },
    },
    layers: [...layers, ...streetLabelLayers(scheme)],
  };
}
