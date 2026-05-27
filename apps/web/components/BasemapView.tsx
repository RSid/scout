"use client";

import dynamic from "next/dynamic";

import type { CorridorResponse } from "@/lib/api";
import type { GeoJSON } from "geojson";

/**
 * `<LoadedMap>` is the heavy MapLibre + PMTiles client bundle. While it loads
 * we render `BasemapInteractiveLoadingShell` (silent, layout-stable) — *not*
 * the stub-mode placeholder, which would briefly flash misleading copy
 * ("set NEXT_PUBLIC_SCOUT_MAP_MODE=interactive") into an interactive session.
 */
const LoadedMap = dynamic(() => import("./BasemapInner"), {
  loading: BasemapInteractiveLoadingShell,
  ssr: false,
});

type BasemapProps = Readonly<{
  corridor: CorridorResponse["features"];
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
  selectedFeatureId?: string | null | undefined;
  onSelectFeature?: ((id: string | null) => void) | undefined;
}>;

export default function BasemapView({
  corridor,
  route,
  selectedFeatureId = null,
  onSelectFeature,
}: BasemapProps) {
  const mapMode =
    process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "stub" ? "stub" : "interactive";

  if (mapMode === "stub") {
    return (
      <div data-testid="scout-basemap-region">
        <BasemapStubPlaceholder />
      </div>
    );
  }

  return (
    <div data-testid="scout-basemap-region">
      <LoadedMap
        corridor={corridor}
        route={route}
        selectedFeatureId={selectedFeatureId}
        onSelectFeature={onSelectFeature}
      />
    </div>
  );
}

/** Stub-mode placeholder: only rendered when `NEXT_PUBLIC_SCOUT_MAP_MODE=stub`. */
function BasemapStubPlaceholder() {
  return (
    <section
      aria-labelledby="scout-map-placeholder-title"
      className="relative flex min-h-[640px] w-full flex-col items-center justify-center gap-3 rounded-tokenLg border border-dashed border-border bg-surface-elevated px-6 text-center"
    >
      <h2
        id="scout-map-placeholder-title"
        className="text-lg font-semibold text-[color:var(--color-text)]"
      >
        Map placeholder
      </h2>
      <p className="max-w-[var(--measure-body)] text-[color:var(--color-text-muted)]">
        The interactive map is in stub mode. Developers: set
        <code>NEXT_PUBLIC_SCOUT_MAP_MODE=interactive</code> locally to load MapLibre.
      </p>
      <noscript>JavaScript is needed to load Scout&apos;s interactive map.</noscript>
    </section>
  );
}

/**
 * Interactive-mode dynamic-import fallback. Same dimensions and corner-radius
 * as the rendered map so swapping `<LoadedMap>` in does not shift layout, and
 * SR users get one terse "Loading map" announcement instead of the stub-mode
 * copy.
 */
function BasemapInteractiveLoadingShell() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-testid="basemap-interactive-loading"
      className="min-h-[640px] w-full rounded-tokenLg border border-border bg-surface-elevated"
    >
      <span className="sr-only">Loading map…</span>
    </div>
  );
}
