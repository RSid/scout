"use client";

import type { CorridorResponse } from "@/lib/api";
import type { ApiCategory } from "@/lib/api";
import {
  inspectionFreshnessTreatment,
  type InspectionFreshnessTreatment,
} from "@/lib/data-sources";

import {
  kindSupportLabel,
  kindObstacleLabel,
  freshnessChipText,
  lastInspectedLabel,
  inspectionUnknownLabel,
  asOfYearNote,
  en,
} from "@/lib/i18n/messages";

export type CorridorFeatureLite = CorridorResponse["features"][number];

type Props = Readonly<{
  category: ApiCategory | null;
  feature: CorridorFeatureLite;
  referenceYear?: number | undefined;
}>;

function notesPlainText(feature: CorridorFeatureLite): string | null {
  const raw = feature.properties?.attributes as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const candidate = raw.notes;
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim();
  }
  return null;
}

function freshnessBlock(
  year: number | null,
  refYear: number,
): Readonly<{ treatment: InspectionFreshnessTreatment }> {
  return { treatment: inspectionFreshnessTreatment(year, refYear) };
}

/** MapLibre popup content for one corridor marker (voice-and-copy §7.8 DEC-021). */
export default function FeaturePopup({ category, feature, referenceYear }: Props) {
  const props = feature.properties as Record<string, unknown> | undefined;
  const refY =
    typeof referenceYear === "number" ? referenceYear : new Date().getFullYear();

  const label = category?.label ?? String(props?.category ?? en.categoryFallback);
  const kindRaw = typeof props?.kind === "string" ? props.kind : "obstacle";
  const condition =
    typeof props?.condition === "string" ? props.condition : inspectionUnknownLabel();
  let inspectedYear: number | null = null;
  if (
    typeof props?.inspected_year === "number" &&
    Number.isFinite(props.inspected_year)
  ) {
    inspectedYear = props.inspected_year;
  }

  const sourceDataset =
    typeof props?.source_dataset === "string" ? props.source_dataset : "";
  const notes = notesPlainText(feature);
  const description = category?.description?.trim?.() ?? "";
  const { treatment } = freshnessBlock(inspectedYear, refY);
  const kindDisplay = kindRaw === "aid" ? kindSupportLabel() : kindObstacleLabel();

  return (
    <section
      aria-labelledby="scout-marker-popup-heading"
      className="max-w-[18rem] space-y-[var(--space-2)] px-[var(--space-2)] pb-[var(--space-2)] pt-[var(--space-3)] font-sans text-[color:var(--color-text)]"
    >
      <header id="scout-marker-popup-heading" className="space-y-[var(--space-1)]">
        <div className="flex flex-wrap items-center gap-[var(--space-2)]">
          <span className="text-sm font-semibold leading-tight">{label}</span>
          <span className="rounded-tokenSm bg-[color:var(--color-surface-sunken)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
            {kindDisplay}
          </span>
        </div>
        <p className="text-xs text-[color:var(--color-text-muted)]">{description}</p>
      </header>
      <div className="space-y-[var(--space-2)] text-sm leading-snug">
        <p className="text-[color:var(--color-text)]">{condition}</p>
        <p className="text-xs text-[color:var(--color-text-muted)]">
          {lastInspectedLinePlain(inspectedYear)}
        </p>
        <FreshnessRow treatment={treatment} />
        {sourceDataset === "refugerestrooms" && notes !== null ? (
          <p className="text-xs leading-snug text-[color:var(--color-text-muted)]">
            {notes}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function lastInspectedLinePlain(year: number | null): string {
  if (year === null) {
    return inspectionUnknownLabel();
  }
  return lastInspectedLabel(year);
}

function FreshnessRow({
  treatment,
}: Readonly<{ treatment: InspectionFreshnessTreatment }>) {
  switch (treatment.kind) {
    case "recent":
      return null;
    case "unknown":
      return null;
    case "as_of":
      return (
        <p className="text-xs text-[color:var(--color-text-muted)]">
          {asOfYearNote(treatment.year)}
        </p>
      );
    case "stale_chip":
      return (
        <span
          className="inline-flex items-center rounded-tokenSm border border-[color:var(--color-warning-border)] bg-[color:var(--color-warning-surface)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-warning-text)]"
          data-testid="freshness-chip"
        >
          {freshnessChipText(treatment.year)}
        </span>
      );
    default:
      return null;
  }
}
