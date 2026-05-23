import type maplibregl from "maplibre-gl";

/**
 * Dev / Playwright seam: BasemapInner assigns `window.scoutMap` only when
 * NODE_ENV !== "production". Never rely on this in shipped behavior.
 */
declare global {
  interface Window {
    scoutMap?: maplibregl.Map;
  }
}

export {};
