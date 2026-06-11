/**
 * Raster marker sprites for MapLibre (DEC-015).
 * Source SVGs live in `design/markers/` and are duplicated to `public/map-markers/`
 * so the browser can `fetch()` them without a custom bundler loader.
 */

import type { GeoJSON } from "geojson";

import type { ColorToken } from "@/design/tokens/colors";
import type { CorridorResponse } from "@/lib/api";
import maplibregl from "maplibre-gl";

import { resolveColorToken } from "@/design/tokens/colors";

/** Default-on M1 corridor categories mapped to filenames under `/map-markers/`. */
export const ROUTE_MARKER_CATEGORY_IDS = [
  "curb_ramps",
  "barriers",
  "audible_signals",
  "restrooms",
  "rest_spots",
  "water_cooling",
] as const;

export type RouteMarkerCategoryId = (typeof ROUTE_MARKER_CATEGORY_IDS)[number];

const OBSTACLE_CATEGORIES = new Set<RouteMarkerCategoryId>([
  "curb_ramps",
  "barriers",
  "audible_signals",
]);

/** Icon paint variant: obstacles use severity tokens; aids use `aid`. */
export type ScoutMarkerSeverity = "mild" | "difficult" | "blocking" | "aid";

function isObstacleMarkerCategory(cat: string): cat is RouteMarkerCategoryId {
  return OBSTACLE_CATEGORIES.has(cat as RouteMarkerCategoryId);
}

function colorTokenForSeverity(severity: ScoutMarkerSeverity): ColorToken {
  switch (severity) {
    case "aid":
      return "aid";
    case "blocking":
      return "obstacle-blocking";
    case "difficult":
      return "obstacle-difficult";
    default:
      return "obstacle-mild";
  }
}

/** Derives the sprite suffix from corridor feature properties (same rule as circle colors). */
export function deriveMarkerSeverity(
  kind: string | undefined | null,
  conditionNormalized: string | undefined | null,
): ScoutMarkerSeverity {
  if (kind === "aid") return "aid";
  const normalized = typeof conditionNormalized === "string" ? conditionNormalized : "";
  if (normalized === "blocking" || normalized === "missing") return "blocking";
  if (normalized === "difficult") return "difficult";
  return "mild";
}

export function scoutMarkerIconId(
  categoryId: string,
  severity: ScoutMarkerSeverity,
): string {
  return `${categoryId}:${severity}`;
}

function combosForCategories(): Iterable<readonly [string, ScoutMarkerSeverity]> {
  const out: [string, ScoutMarkerSeverity][] = [];
  for (const cat of ROUTE_MARKER_CATEGORY_IDS) {
    if (isObstacleMarkerCategory(cat)) {
      out.push([cat, "mild"], [cat, "difficult"], [cat, "blocking"]);
    } else {
      out.push([cat, "aid"]);
    }
  }
  return out;
}

async function fetchSvgMarkup(baseUrl: string, categoryId: string): Promise<string> {
  const trimmed = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const resp = await fetch(`${trimmed}/map-markers/${categoryId}.svg`, {
    cache: "force-cache",
  });
  if (!resp.ok) {
    throw new Error(`Failed to load marker SVG for ${categoryId}: ${resp.status}`);
  }
  return resp.text();
}

function tintedSvgMarkup(svg: string, hex: string): string {
  return svg.replace(/fill="currentColor"/g, `fill="${hex}"`);
}

function loadImageFromDataUrl(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); // Raster path for HTMLImageElement; MapLibre accepts this.
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Marker SVG raster failed."));
    img.src = uri;
  });
}

async function tintedMarkerImage(
  svgMarkup: string,
  hex: string,
): Promise<HTMLImageElement> {
  const tinted = tintedSvgMarkup(svgMarkup, hex);
  const encoded = encodeURIComponent(tinted);
  const uri = `data:image/svg+xml;charset=utf-8,${encoded}`;
  return loadImageFromDataUrl(uri);
}

const scoutMarkerSvgDataMemo = new Map<string, Promise<string>>();

/** Tinted SVG `data:` URI for inline list thumbnails (paired with sprites on map). */
export async function scoutMarkerTintedSvgDataUri(
  categoryId: string,
  severity: ScoutMarkerSeverity,
  opts: Readonly<{ basePublicUrl?: string | undefined }> = {},
): Promise<string> {
  const cacheKey = scoutMarkerIconId(categoryId, severity);
  let pending = scoutMarkerSvgDataMemo.get(cacheKey);
  if (pending === undefined) {
    pending = (async (): Promise<string> => {
      const basePublicUrl =
        opts.basePublicUrl ??
        (typeof window !== "undefined" ? window.location.origin : "");
      const svgMarkup = await fetchSvgMarkup(basePublicUrl, categoryId);
      const hex = resolveColorToken(colorTokenForSeverity(severity));
      const tinted = tintedSvgMarkup(svgMarkup, hex);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tinted)}`;
    })();
    scoutMarkerSvgDataMemo.set(cacheKey, pending);
  }
  return pending;
}

/** Pre-computes tinted data URLs for distinct `(category, severity)` pairs on the list. */
export async function scoutMarkerTintedSvgDataUriBatch(
  combos: Iterable<readonly [string, ScoutMarkerSeverity]>,
  opts: Readonly<{ basePublicUrl?: string | undefined }> = {},
): Promise<ReadonlyMap<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    [...combos].map(async ([categoryId, severity]) => {
      const key = scoutMarkerIconId(categoryId, severity);
      const uri = await scoutMarkerTintedSvgDataUri(categoryId, severity, opts);
      out.set(key, uri);
    }),
  );
  return out;
}

/**
 * Registers one raster image per `{category}:{severity}` used on the corridor layer.
 *
 * `@param map` — styled MapLibre map.
 * `@param opts.basePublicUrl` — origin + optional path prefix, e.g. `""` for same-origin or full URL for tests.
 */
export async function registerScoutRouteMarkerSprites(
  map: maplibregl.Map,
  opts: Readonly<{ basePublicUrl?: string | undefined }> = {},
): Promise<void> {
  const basePublicUrl =
    opts.basePublicUrl ?? (typeof window !== "undefined" ? window.location.origin : "");

  const svgByCategory = new Map<string, string>();
  async function markupFor(cat: string): Promise<string> {
    const cached = svgByCategory.get(cat);
    if (cached !== undefined) {
      return cached;
    }
    const fetched = await fetchSvgMarkup(basePublicUrl, cat);
    svgByCategory.set(cat, fetched);
    return fetched;
  }

  await Promise.all(
    Array.from(combosForCategories()).map(async ([categoryId, severity]) => {
      const id = scoutMarkerIconId(categoryId, severity);
      if (map.hasImage(id)) {
        return;
      }
      const hex = resolveColorToken(colorTokenForSeverity(severity));
      const svgMarkup = await markupFor(categoryId);
      const img = await tintedMarkerImage(svgMarkup, hex);
      map.addImage(id, img);
    }),
  );
}

/** Removes sprites registered via `registerScoutRouteMarkerSprites` (best-effort, for HMR/tests). */
export function removeScoutRouteMarkerSprites(map: maplibregl.Map): void {
  for (const [categoryId, severity] of combosForCategories()) {
    const id = scoutMarkerIconId(categoryId, severity);
    if (map.hasImage(id)) {
      map.removeImage(id);
    }
  }
}

/** Adds `scout_severity` GeoJSON props for cluster + symbol layouts. */
export function corridorFeatureWithMarkerSeverity(
  feature: CorridorResponse["features"][number],
): GeoJSON.Feature {
  const props = feature.properties as Record<string, unknown> | null;
  const kind = typeof props?.kind === "string" ? props.kind : undefined;
  const norm =
    typeof props?.condition_normalized === "string"
      ? props.condition_normalized
      : undefined;

  const severity = deriveMarkerSeverity(kind, norm);

  return {
    ...feature,
    properties: {
      ...props,
      scout_severity: severity,
      category:
        typeof props?.category === "string" ? props.category : String(props?.category),
    },
  };
}
