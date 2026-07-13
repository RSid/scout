import type { LayerSpecification, SymbolLayerSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";

import {
  BASEMAP_GLYPHS_URL,
  BASEMAP_SOURCE_ID,
  buildDcBasemapStyle,
} from "./basemap-style";

function symbolLayerById(
  layers: LayerSpecification[],
  id: string,
): SymbolLayerSpecification {
  const layer = layers.find((l) => l.id === id);
  if (layer === undefined || layer.type !== "symbol") {
    throw new Error(`expected a symbol layer with id "${id}"`);
  }
  return layer;
}

describe("buildDcBasemapStyle", () => {
  it("wires a self-hosted, same-origin glyphs endpoint (NF-PRIV-01)", () => {
    // A relative path guarantees no third-party CDN request leaks a client IP.
    expect(buildDcBasemapStyle(false).glyphs).toBe(BASEMAP_GLYPHS_URL);
  });

  it("keeps the glyphs endpoint off any third-party host", () => {
    expect(buildDcBasemapStyle(false).glyphs?.startsWith("/")).toBe(true);
  });

  it("adds the major-street label symbol layer bound to the roads source-layer", () => {
    const layer = symbolLayerById(
      buildDcBasemapStyle(false).layers,
      "scout-street-labels-major",
    );
    expect(layer["source-layer"]).toBe("roads");
  });

  it("labels streets with a fontstack we ship glyphs for", () => {
    const layer = symbolLayerById(
      buildDcBasemapStyle(false).layers,
      "scout-street-labels-minor",
    );
    expect(layer.layout?.["text-font"]).toStrictEqual(["Noto Sans Regular"]);
  });

  it("draws street labels from the segment name field", () => {
    const layer = symbolLayerById(
      buildDcBasemapStyle(false).layers,
      "scout-street-labels-major",
    );
    expect(layer.layout?.["text-field"]).toStrictEqual([
      "coalesce",
      ["get", "name"],
      "",
    ]);
  });

  it("swaps label colors for prefers-color-scheme so contrast holds in both schemes", () => {
    const light = symbolLayerById(
      buildDcBasemapStyle(false).layers,
      "scout-street-labels-major",
    );
    const dark = symbolLayerById(
      buildDcBasemapStyle(true).layers,
      "scout-street-labels-major",
    );
    expect(dark.paint?.["text-color"]).not.toBe(light.paint?.["text-color"]);
  });

  it("keeps the local pmtiles vector source", () => {
    const source = buildDcBasemapStyle(false).sources[BASEMAP_SOURCE_ID];
    expect(source).toMatchObject({
      type: "vector",
      url: "pmtiles:///tiles/dc.pmtiles",
    });
  });
});
