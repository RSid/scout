"use client";

import type { CorridorResponse } from "@/lib/api";

import type { InspectionFreshnessTreatment } from "@/lib/data-sources";
import { inspectionFreshnessTreatment } from "@/lib/data-sources";
import {
  corridorFeatureId,
  deriveMarkerSeverity,
  hasMapMarkerSupport,
  scoutMarkerIconId,
  scoutMarkerTintedSvgDataUriBatch,
  type ScoutMarkerSeverity,
} from "@/lib/map/markers";
import { resolveLocationLabel } from "@/lib/map/location-label";
import {
  asOfYearNote,
  blockAidsLabel,
  blockFeatureCount,
  blockObstaclesLabel,
  en,
  freshnessChipText,
  inspectionUnknownLabel,
  kindObstacleLabel,
  kindSupportLabel,
  lastInspectedLabel,
  summarizeMetersFromStartRounded,
} from "@/lib/i18n/messages";
import { useProfile } from "@/lib/profile";

import type { ReactElement } from "react";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const BLOCK_SIZE_METERS = 100;

export type CorridorFeatureProps = CorridorResponse["features"][number];

/** Corridor fetch UX: `idle` before profile ready or no categories enabled;
 *  `error` when the fetch failed (kept distinct from a legitimately empty `ready`). */
export type CorridorListingStatus = "idle" | "loading" | "ready" | "error";

type Props = Readonly<{
  features: readonly CorridorFeatureProps[];
  listingStatus: CorridorListingStatus;
  selectedFeatureId: string | null;
  onShowOnMap: (id: string) => void;
}>;

function rowSelectableId(feature: CorridorFeatureProps): string | null {
  return corridorFeatureId(feature);
}

function featureStableId(
  feature: CorridorFeatureProps,
  rowIndex: number,
): string | null {
  if (feature.id !== undefined && feature.id !== null) {
    return String(feature.id);
  }
  const raw = feature.properties as Record<string, unknown> | undefined;
  if (raw?.id !== undefined && raw?.id !== null) {
    return String(raw.id as string | number | boolean);
  }
  return `idx:${String(rowIndex)}`;
}

function notesPlain(feature: CorridorFeatureProps): string | null {
  const attrs = feature.properties?.attributes as Record<string, unknown> | undefined;
  if (!attrs || typeof attrs !== "object") {
    return null;
  }
  const n = attrs["notes"];
  return typeof n === "string" && n.trim().length > 0 ? n.trim() : null;
}

function alongRouteSummaryText(feature: CorridorFeatureProps): string {
  const raw = feature.properties as Record<string, unknown> | undefined;
  const m = raw?.along_route_meters;
  return typeof m === "number" && Number.isFinite(m)
    ? summarizeMetersFromStartRounded(m)
    : "Along-route distance unavailable.";
}

function uniqMarkerCombos(
  features: readonly CorridorFeatureProps[],
): [string, ScoutMarkerSeverity][] {
  const keys = new Set<string>();
  const out: [string, ScoutMarkerSeverity][] = [];

  features.forEach((feat) => {
    const props = feat.properties as Record<string, unknown> | undefined;
    const catRaw = props?.category;
    const cat =
      typeof catRaw === "string"
        ? catRaw
        : String(catRaw ?? "unknown_mapped_category_row");
    if (!hasMapMarkerSupport(cat)) return;
    const kind = typeof props?.kind === "string" ? props.kind : "";
    const norm =
      typeof props?.condition_normalized === "string" ? props.condition_normalized : "";
    const sev = deriveMarkerSeverity(kind || undefined, norm || undefined);
    const key = scoutMarkerIconId(cat, sev);
    if (!keys.has(key)) {
      keys.add(key);
      out.push([cat, sev]);
    }
  });

  return out;
}

function ListFreshnessBlock({
  treatment,
}: Readonly<{ treatment: InspectionFreshnessTreatment }>) {
  switch (treatment.kind) {
    case "recent":
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

type BlockGroup = Readonly<{
  key: number;
  startMeters: number;
  endMeters: number;
  streetName: string | null;
  features: readonly CorridorFeatureProps[];
  aidCount: number;
  obstacleCount: number;
}>;

function groupByBlock(
  features: readonly CorridorFeatureProps[],
): readonly BlockGroup[] {
  const buckets = new Map<number, CorridorFeatureProps[]>();

  for (const feat of features) {
    const raw = feat.properties as Record<string, unknown> | undefined;
    const m = raw?.along_route_meters;
    const bucket =
      typeof m === "number" && Number.isFinite(m)
        ? Math.floor(m / BLOCK_SIZE_METERS)
        : -1;
    let list = buckets.get(bucket);
    if (list === undefined) {
      list = [];
      buckets.set(bucket, list);
    }
    list.push(feat);
  }

  const keys = [...buckets.keys()].sort((a, b) => a - b);

  return keys.map((bucket) => {
    const items = buckets.get(bucket)!;
    let aidCount = 0;
    let obstacleCount = 0;
    let streetName: string | null = null;

    for (const feat of items) {
      const props = feat.properties as Record<string, unknown> | undefined;
      const kind = typeof props?.kind === "string" ? props.kind : "obstacle";
      if (kind === "aid") {
        aidCount++;
      } else {
        obstacleCount++;
      }
      if (streetName === null) {
        const sn = props?.street_name;
        if (typeof sn === "string" && sn.trim().length > 0) {
          streetName = sn.trim();
        }
      }
    }

    const start = bucket < 0 ? 0 : bucket * BLOCK_SIZE_METERS;
    const end = start + BLOCK_SIZE_METERS;

    return {
      key: bucket,
      startMeters: start,
      endMeters: end,
      streetName,
      features: items,
      aidCount,
      obstacleCount,
    };
  });
}

function FeatureGlyph({
  markerUrls,
  categoryId,
  severity,
}: Readonly<{
  markerUrls: ReadonlyMap<string, string>;
  categoryId: string;
  severity: ScoutMarkerSeverity;
}>) {
  const key = scoutMarkerIconId(categoryId, severity);
  const src = markerUrls.get(key);

  /**
   * The data-URI batch is async; on first paint `src` is undefined for every
   * row. Rendering `<img src="">` would make the browser refetch the document
   * URL once per row (HTML spec), so a list of 190 features triggers 190
   * spurious page-document fetches and a visible flicker. Render a same-size
   * neutral placeholder until the batch resolves, then swap in the real img.
   */
  if (src === undefined || src.length === 0) {
    return <span aria-hidden className="inline-block h-[24px] w-[24px] shrink-0" />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- marker is a tinted inline SVG bitmap.
    <img
      src={src}
      alt=""
      aria-hidden
      width={24}
      height={24}
      className="inline-block shrink-0"
    />
  );
}

function FeatureRow({
  feature,
  categoryLabel,
  categoryDescription,
  markerUrls,
  selectedFeatureId,
  onShowOnMap,
}: Readonly<{
  feature: CorridorFeatureProps;
  categoryLabel: string;
  categoryDescription: string;
  markerUrls: ReadonlyMap<string, string>;
  selectedFeatureId: string | null;
  onShowOnMap: (id: string) => void;
}>): ReactElement | null {
  if (feature.geometry.type !== "Point") {
    return null;
  }

  const props = feature.properties as Record<string, unknown> | undefined;
  const catRaw = props?.category;
  const categoryId =
    typeof catRaw === "string"
      ? catRaw
      : String(catRaw ?? "unknown_mapped_category_row");
  const condition =
    typeof props?.condition === "string" ? props.condition : en.conditionUnknownVisible;
  let inspectedYear: number | null = null;
  const yRaw = props?.inspected_year;
  if (typeof yRaw === "number" && Number.isFinite(yRaw)) {
    inspectedYear = yRaw;
  }

  const refYear = new Date().getFullYear();
  const treatment = inspectionFreshnessTreatment(inspectedYear, refYear);

  const kindRaw = typeof props?.kind === "string" ? props.kind : "obstacle";
  const normalized =
    typeof props?.condition_normalized === "string" ? props.condition_normalized : "";
  const severity = deriveMarkerSeverity(kindRaw, normalized);
  const kindDisplay = kindRaw === "aid" ? kindSupportLabel() : kindObstacleLabel();

  const sourceDataset =
    typeof props?.source_dataset === "string" ? props.source_dataset : "";

  const alongText = alongRouteSummaryText(feature);
  const location = resolveLocationLabel(props ?? null);
  const selectableId = rowSelectableId(feature);
  const isSelected =
    selectableId !== null &&
    selectedFeatureId !== null &&
    selectableId === selectedFeatureId;

  return (
    <li>
      <details className="rounded-tokenLg border border-border bg-surface-elevated text-[color:var(--color-text)]">
        <summary className="flex min-h-tap cursor-pointer list-none flex-row items-center gap-[var(--space-3)] px-[var(--space-4)] py-[var(--space-3)] [&::-webkit-details-marker]:hidden">
          <FeatureGlyph
            markerUrls={markerUrls}
            categoryId={categoryId}
            severity={severity}
          />
          <span className="text-left text-sm font-medium leading-snug">
            <span aria-hidden>{`${categoryLabel} · ${condition}`}</span>
            {location !== null ? (
              <span aria-hidden>{` · ${location.text}`}</span>
            ) : null}
            <span aria-hidden>{` · ${alongText}`}</span>
            <span className="sr-only">
              {location !== null
                ? `${categoryLabel}, ${condition}, ${location.text}, ${alongText}`
                : `${categoryLabel}, ${condition}, ${alongText}`}
            </span>
          </span>
        </summary>

        <div className="space-y-[var(--space-3)] border-t border-border px-[var(--space-4)] py-[var(--space-4)]">
          <p className="text-xs text-[color:var(--color-text-muted)]">
            {categoryDescription}
          </p>
          <p className="text-sm text-[color:var(--color-text)]">{condition}</p>
          <div className="flex flex-wrap items-center gap-[var(--space-2)] text-xs">
            <span className="rounded-tokenSm bg-[color:var(--color-surface-sunken)] px-2 py-0.5 font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]">
              {kindDisplay}
            </span>
            <p className="text-[color:var(--color-text-muted)]">{alongText}</p>
          </div>
          <p className="text-xs text-[color:var(--color-text-muted)]">
            {inspectedYear !== null
              ? lastInspectedLabel(inspectedYear)
              : inspectionUnknownLabel()}
          </p>
          <ListFreshnessBlock treatment={treatment} />
          {sourceDataset === "refugerestrooms" && notesPlain(feature) !== null ? (
            <p className="text-xs leading-snug text-[color:var(--color-text-muted)]">
              {notesPlain(feature)}
            </p>
          ) : null}
          <button
            type="button"
            aria-current={isSelected === true ? "true" : undefined}
            disabled={selectableId === null}
            onClick={() => {
              if (selectableId !== null) {
                onShowOnMap(selectableId);
              }
            }}
            className="inline-flex min-h-tap items-center justify-center rounded-tokenMd border border-border bg-accent px-[var(--space-4)] py-[var(--space-3)] font-semibold text-[color:var(--color-on-accent)] focus-visible:btn-accent-double-ring-dark disabled:pointer-events-none disabled:opacity-50"
          >
            {en.openOnMap}
          </button>
        </div>
      </details>
    </li>
  );
}

function BlockGroupSection({
  group,
  categoryById,
  markerUrls,
  selectedFeatureId,
  onShowOnMap,
}: Readonly<{
  group: BlockGroup;
  categoryById: ReadonlyMap<string, { label: string; description: string }>;
  markerUrls: ReadonlyMap<string, string>;
  selectedFeatureId: string | null;
  onShowOnMap: (id: string) => void;
}>) {
  const total = group.features.length;
  const rangeLabel = `${String(group.startMeters)}–${String(group.endMeters)}m`;
  const title =
    group.streetName !== null ? `${group.streetName} · ${rangeLabel}` : rangeLabel;

  const barTotal = group.aidCount + group.obstacleCount;

  return (
    <li>
      <details
        data-testid="block-group"
        className="rounded-tokenLg border border-border bg-surface-elevated text-[color:var(--color-text)]"
      >
        <summary className="flex cursor-pointer list-none flex-col gap-[var(--space-2)] px-[var(--space-4)] py-[var(--space-3)] [&::-webkit-details-marker]:hidden">
          <span className="flex min-h-tap items-center gap-[var(--space-3)]">
            <svg
              aria-hidden
              width="16"
              height="16"
              viewBox="0 0 16 16"
              className="shrink-0 text-[color:var(--color-text-muted)] transition-transform [details[open]_&]:rotate-90"
            >
              <path
                d="M6 4l4 4-4 4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="flex-1 text-left text-sm font-medium leading-snug">
              {title}
            </span>
            <span className="text-xs text-[color:var(--color-text-muted)]">
              {blockFeatureCount(total)}
            </span>
          </span>
          <span className="flex h-[6px] gap-[2px] overflow-hidden rounded-full">
            {group.aidCount > 0 ? (
              <span
                className="rounded-full bg-[color:var(--color-aid)]"
                style={{ flex: group.aidCount / barTotal }}
              />
            ) : null}
            {group.obstacleCount > 0 ? (
              <span
                className="rounded-full bg-[color:var(--color-obstacle-blocking)]"
                style={{ flex: group.obstacleCount / barTotal }}
              />
            ) : null}
          </span>
          <span className="flex gap-[var(--space-3)] text-xs">
            {group.aidCount > 0 ? (
              <span className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-aid)]"
                />
                <span className="text-[color:var(--color-text-muted)]">
                  {blockAidsLabel(group.aidCount)}
                </span>
              </span>
            ) : null}
            {group.obstacleCount > 0 ? (
              <span className="flex items-center gap-1">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 rounded-full bg-[color:var(--color-obstacle-blocking)]"
                />
                <span className="text-[color:var(--color-text-muted)]">
                  {blockObstaclesLabel(group.obstacleCount)}
                </span>
              </span>
            ) : null}
          </span>
        </summary>

        <ol className="space-y-[var(--space-2)] border-t border-border px-[var(--space-3)] py-[var(--space-3)]">
          {group.features.map((feat, idx) => {
            const catId =
              typeof feat.properties?.category === "string"
                ? feat.properties.category
                : "unknown_mapped_category_row";
            const cat = categoryById.get(catId);
            const label =
              typeof cat?.label === "string" && cat.label.length > 0
                ? cat.label
                : catId;
            const description =
              typeof cat?.description === "string"
                ? cat.description
                : "Description unavailable for this category.";

            return (
              <FeatureRow
                key={
                  featureStableId(feat as CorridorFeatureProps, idx) ??
                  `row-${String(idx)}`
                }
                feature={feat as CorridorFeatureProps}
                categoryLabel={label}
                categoryDescription={description}
                markerUrls={markerUrls}
                selectedFeatureId={selectedFeatureId}
                onShowOnMap={onShowOnMap}
              />
            );
          })}
        </ol>
      </details>
    </li>
  );
}

export default function FeatureListView({
  listingStatus,
  features,
  selectedFeatureId,
  onShowOnMap,
}: Props) {
  const { categories } = useProfile();

  const categoryById = useMemo(() => {
    const m = new Map<string, (typeof categories)[number]>();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  const combos = useMemo(() => uniqMarkerCombos(features), [features]);

  const [markerUrls, setMarkerUrls] = useState<ReadonlyMap<string, string>>(
    new Map<string, string>(),
  );

  useEffect(() => {
    let cancelled = false;
    void scoutMarkerTintedSvgDataUriBatch(combos).then((next) => {
      if (!cancelled) {
        setMarkerUrls(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [combos]);

  const sortedPointFeatures = useMemo(() => {
    const points = features.filter(
      (f): f is CorridorFeatureProps =>
        f.geometry !== null &&
        typeof f.geometry === "object" &&
        f.geometry.type === "Point" &&
        hasMapMarkerSupport(
          typeof f.properties?.category === "string" ? f.properties.category : "",
        ),
    );
    return [...points].sort((a, b) => {
      const ap = (a.properties as Record<string, unknown> | undefined)
        ?.along_route_meters;
      const bp = (b.properties as Record<string, unknown> | undefined)
        ?.along_route_meters;
      const aa = typeof ap === "number" && Number.isFinite(ap) ? ap : Infinity;
      const bb = typeof bp === "number" && Number.isFinite(bp) ? bp : Infinity;
      return aa === bb ? 0 : aa < bb ? -1 : 1;
    });
  }, [features]);

  const blockGroups = useMemo(
    () => groupByBlock(sortedPointFeatures),
    [sortedPointFeatures],
  );

  const listRef = useRef<HTMLOListElement>(null);

  const toggleAll = useCallback(() => {
    const ol = listRef.current;
    if (ol === null) return;
    const details = ol.querySelectorAll<HTMLDetailsElement>(":scope > li > details");
    const allOpen = Array.from(details).every((d) => d.open);
    details.forEach((d) => {
      d.open = !allOpen;
    });
  }, []);

  const showUpdating = listingStatus === "loading" && features.length === 0;
  const showError = listingStatus === "error";
  const showEmpty =
    !showError && listingStatus === "ready" && sortedPointFeatures.length === 0;

  return (
    <section
      id="scout-route-list"
      aria-labelledby="feature-list-heading"
      className="space-y-[var(--space-4)]"
      tabIndex={-1}
    >
      <header>
        <h2
          id="feature-list-heading"
          className="text-lg font-semibold text-[color:var(--color-text)]"
        >
          {en.alongRouteHeading}
          {sortedPointFeatures.length > 0 ? (
            <span className="ml-2 text-[color:var(--color-text-muted)]">
              ({String(sortedPointFeatures.length)})
            </span>
          ) : null}
        </h2>
        <p className="text-sm text-[color:var(--color-text-muted)]">
          {en.alongRouteLead}
        </p>
      </header>

      {showUpdating ? (
        <p className="text-sm text-[color:var(--color-text-muted)]">
          {en.corridorListingInProgress}
        </p>
      ) : null}

      {showError ? (
        <p className="rounded-tokenLg border border-[color:var(--color-danger-border)] bg-[color:var(--color-danger-surface)] px-[var(--space-4)] py-[var(--space-4)] text-sm text-[color:var(--color-danger-text)]">
          {en.corridorListingErrorTitle}
        </p>
      ) : null}

      {showEmpty ? (
        <p className="rounded-tokenLg border border-dashed border-border bg-surface-elevated px-[var(--space-4)] py-[var(--space-4)] text-sm text-[color:var(--color-text-muted)]">
          {en.alongRouteEmptyState}
        </p>
      ) : null}

      {!showEmpty && !showError && blockGroups.length > 0 ? (
        <>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={toggleAll}
              className="min-h-tap text-xs font-medium text-accent"
            >
              {en.blockExpandAll} / {en.blockCollapseAll}
            </button>
          </div>
          <ol ref={listRef} className="space-y-[var(--space-3)]">
            {blockGroups.map((group) => (
              <BlockGroupSection
                key={group.key}
                group={group}
                categoryById={categoryById}
                markerUrls={markerUrls}
                selectedFeatureId={selectedFeatureId}
                onShowOnMap={onShowOnMap}
              />
            ))}
          </ol>
        </>
      ) : null}
    </section>
  );
}
