"use client";

import type { CorridorResponse } from "@/lib/api";
import type { GeoJSON } from "geojson";

import { obstacleMarkerSlug } from "@/components/FeatureMarker";
import { summarizeLineStringDegrees, formatApproxMeters } from "@/lib/geo";

export type CorridorFeatureProps = CorridorResponse["features"][number];

type Props = Readonly<{
  features: readonly CorridorFeatureProps[];
  route: GeoJSON.Feature<GeoJSON.LineString>;
}>;

export default function FeatureListView({ route, features }: Props) {
  return (
    <section aria-labelledby="feature-list-heading" className="space-y-4">
      <header>
        <h2
          id="feature-list-heading"
          className="text-lg font-semibold text-[color:var(--color-text)]"
        >
          Nearby features ({features.length})
        </h2>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          Expanded rows summarize condition and freshness for non-map readers.
        </p>
      </header>

      <ol className="space-y-3">
        {features.map((feat) => {
          const slug = `${feat.properties?.category ?? "feature"}`;
          return (
            <li key={feat.id ?? slug}>
              <FeatureRow slug={slug} feat={feat} route={route} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function slugLabel(categorySlug: string): string {
  return categorySlug.replaceAll("_", " ");
}

function FeatureRow({
  slug,
  feat,
  route,
}: Readonly<{
  slug: string;
  feat: CorridorFeatureProps;
  route: GeoJSON.Feature<GeoJSON.LineString>;
}>) {
  let offsetText = "";

  if (feat.geometry.type === "Point") {
    const lon = feat.geometry.coordinates[0];
    const lat = feat.geometry.coordinates[1];

    try {
      if (lon !== undefined && lat !== undefined) {
        const { crossMetersRough } = summarizeLineStringDegrees(
          route.geometry.coordinates,
          lon,
          lat,
        );
        offsetText = `${formatApproxMeters(crossMetersRough)} from corridor`;
      }
    } catch {
      offsetText = "Distance approximation unavailable.";
    }
  }

  const label = slugLabel(slug);
  const condition =
    typeof feat.properties?.condition === "string"
      ? feat.properties.condition
      : conditionUnknown();

  const shape = obstacleMarkerSlug(slug);

  const inspectedYear =
    typeof feat.properties?.inspected_year === "number"
      ? feat.properties.inspected_year
      : null;

  const summaryHeading = `${shape} · ${label} · ${condition} · ${offsetText || "~ distance unknown"}`;

  return (
    <details className="rounded-tokenLg border border-border bg-surface-elevated text-[color:var(--color-text)]">
      <summary className="flex cursor-pointer list-none flex-col gap-2 px-[var(--space-4)] py-[var(--space-4)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden>{shape}</span>
        <span className="text-left text-base">{summaryHeading}</span>
      </summary>
      <div className="space-y-[var(--space-3)] border-t border-border px-[var(--space-4)] py-[var(--space-4)]">
        <p className="text-sm text-[color:var(--color-text-muted)]">{condition}</p>
        <p className="text-xs text-[color:var(--color-text-muted)]">
          Corridor offset: <span aria-live="polite">{offsetText}</span>
        </p>
        {inspectedYear !== null ? <p>{`Inspected in ${inspectedYear}`}</p> : null}
        <button
          type="button"
          className="rounded-tokenMd border border-border bg-accent px-[var(--space-4)] py-[var(--space-3)] font-semibold text-[color:var(--color-on-accent)] focus-visible:btn-accent-double-ring-dark"
        >
          Show on map
        </button>
      </div>
    </details>
  );
}

function conditionUnknown(): string {
  return "Condition unknown.";
}
