"use client";

import dynamic from "next/dynamic";

import type { CorridorResponse } from "@/lib/api";
import type { GeoJSON } from "geojson";

const LoadedMap = dynamic(() => import("./BasemapInner"), {
  loading: BasemapSkeleton,
  ssr: false,
});

type BasemapProps = Readonly<{
  corridor: CorridorResponse["features"];
  route: GeoJSON.Feature<GeoJSON.LineString> | null;
}>;

export default function BasemapView({ corridor, route }: BasemapProps) {
  const mapMode =
    process.env.NEXT_PUBLIC_SCOUT_MAP_MODE === "stub" ? "stub" : "interactive";

  if (mapMode === "stub") {
    return (
      <div data-testid="scout-basemap-region">
        <BasemapSkeleton />
      </div>
    );
  }

  return (
    <div data-testid="scout-basemap-region">
      <LoadedMap corridor={corridor} route={route} />
    </div>
  );
}

function BasemapSkeleton() {
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
