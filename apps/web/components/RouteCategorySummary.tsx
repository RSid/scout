"use client";

import { useMemo } from "react";

import type { ApiCategory, CorridorResponse } from "@/lib/api";
import { en } from "@/lib/i18n/messages";

// ---- Inline icon primitives (no external icon library needed) ----

/** Filled circle — shape family for supports/aids (DEC-015). */
function SupportShape() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="currentColor"
    >
      <circle cx="6" cy="6" r="5" />
    </svg>
  );
}

/** Filled triangle pointing up — shape family for obstacles (DEC-015). */
function ObstacleShape() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 12 12"
      width="12"
      height="12"
      fill="currentColor"
    >
      <polygon points="6,1 11,11 1,11" />
    </svg>
  );
}

/** Eye-open icon (map layer visible). */
function EyeOpenIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="10" cy="10" rx="8" ry="5" />
      <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Eye-off icon (map layer hidden). */
function EyeOffIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <ellipse cx="10" cy="10" rx="8" ry="5" />
      <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
      {/* Diagonal slash to signal "hidden" */}
      <line x1="3" y1="3" x2="17" y2="17" />
    </svg>
  );
}

// ---- Data helpers ----

type ChipEntry = {
  readonly category: ApiCategory;
  readonly count: number;
};

function buildChipEntries(
  features: CorridorResponse["features"],
  categories: readonly ApiCategory[],
): ChipEntry[] {
  const counts = new Map<string, number>();
  for (const feat of features) {
    const cat = feat.properties?.category;
    if (typeof cat === "string") {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }
  return categories
    .filter((c) => (counts.get(c.id) ?? 0) > 0)
    .map((c) => ({ category: c, count: counts.get(c.id) ?? 0 }));
}

// ---- Component types ----

export type RouteCategorySummaryProps = Readonly<{
  features: CorridorResponse["features"];
  categories: readonly ApiCategory[];
  filterCategoryId: string | null;
  onFilterChange: (id: string | null) => void;
  hiddenCategoryIds: ReadonlySet<string>;
  onMapVisibilityChange: (id: string, visible: boolean) => void;
}>;

// ---- Chip sub-component ----

type ChipProps = Readonly<{
  entry: ChipEntry;
  filterCategoryId: string | null;
  onFilterChange: (id: string | null) => void;
  hiddenCategoryIds: ReadonlySet<string>;
  onMapVisibilityChange: (id: string, visible: boolean) => void;
}>;

function CategoryChip({
  entry,
  filterCategoryId,
  onFilterChange,
  hiddenCategoryIds,
  onMapVisibilityChange,
}: ChipProps) {
  const { category, count } = entry;
  const isFiltered = filterCategoryId === category.id;
  const isHidden = hiddenCategoryIds.has(category.id);

  function handleFilterClick() {
    onFilterChange(isFiltered ? null : category.id);
  }

  function handleVisibilityClick() {
    onMapVisibilityChange(category.id, isHidden);
  }

  const filterAriaLabel = `${String(count)} ${category.label} along this route`;
  const visibilityAriaLabel = isHidden
    ? `Show ${category.label} on map; ${String(count)} along route`
    : `Hide ${category.label} from map; ${String(count)} along route`;

  return (
    <div className="flex items-stretch">
      {/*
       * Filter button: the whole chip face. Pressing it restricts the list
       * to this category, or clears the filter if already active.
       * WCAG 2.5.5: min-height 44px via py-[var(--space-2-5)] + content.
       */}
      <button
        type="button"
        aria-pressed={isFiltered}
        aria-label={filterAriaLabel}
        onClick={handleFilterClick}
        className={`flex min-h-11 items-center gap-[var(--space-2)] rounded-l-tokenMd border py-[var(--space-2)] pl-[var(--space-3)] pr-[var(--space-2)] text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
          isFiltered
            ? "border-accent bg-accent text-[color:var(--color-text-on-accent)]"
            : "border-border bg-surface-elevated text-[color:var(--color-text)] hover:bg-surface-hover"
        }`}
      >
        <span
          className={
            isFiltered
              ? "text-[color:var(--color-text-on-accent)]"
              : category.kind === "aid"
                ? "text-[color:var(--color-accent)]"
                : "text-[color:var(--color-warning)]"
          }
        >
          {category.kind === "aid" ? <SupportShape /> : <ObstacleShape />}
        </span>
        <span aria-hidden="true">{category.label}</span>
        <span
          aria-hidden="true"
          className={`rounded-full px-[var(--space-1-5)] py-0.5 text-xs font-semibold tabular-nums ${
            isFiltered
              ? "bg-[color:var(--color-text-on-accent)]/20 text-[color:var(--color-text-on-accent)]"
              : "bg-surface text-[color:var(--color-text-muted)]"
          }`}
        >
          {count}
        </span>
      </button>

      {/*
       * Visibility toggle: eye / eye-off button at right edge of the chip.
       * Separate from the filter so toggling map visibility doesn't also filter.
       * WCAG 2.5.5: min 44 × 44 px.
       */}
      <button
        type="button"
        aria-pressed={isHidden}
        aria-label={visibilityAriaLabel}
        onClick={handleVisibilityClick}
        className={`flex min-h-11 min-w-11 items-center justify-center rounded-r-tokenMd border-b border-r border-t transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 ${
          isFiltered
            ? "border-accent bg-accent text-[color:var(--color-text-on-accent)] hover:bg-accent/80"
            : "border-border bg-surface-elevated text-[color:var(--color-text-muted)] hover:bg-surface-hover"
        } ${isHidden ? "opacity-50" : ""}`}
      >
        {isHidden ? <EyeOffIcon /> : <EyeOpenIcon />}
      </button>
    </div>
  );
}

// ---- Chip group sub-component ----

type ChipGroupProps = Readonly<{
  headingId: string;
  heading: string;
  chips: readonly ChipEntry[];
  filterCategoryId: string | null;
  onFilterChange: (id: string | null) => void;
  hiddenCategoryIds: ReadonlySet<string>;
  onMapVisibilityChange: (id: string, visible: boolean) => void;
}>;

function ChipGroup({
  headingId,
  heading,
  chips,
  filterCategoryId,
  onFilterChange,
  hiddenCategoryIds,
  onMapVisibilityChange,
}: ChipGroupProps) {
  return (
    <div role="group" aria-labelledby={headingId}>
      <p
        id={headingId}
        className="mb-[var(--space-2)] text-xs font-semibold uppercase tracking-wide text-[color:var(--color-text-muted)]"
      >
        {heading}
      </p>
      <ul className="flex flex-wrap gap-[var(--space-2)]" role="list">
        {chips.map((entry) => (
          <li key={entry.category.id}>
            <CategoryChip
              entry={entry}
              filterCategoryId={filterCategoryId}
              onFilterChange={onFilterChange}
              hiddenCategoryIds={hiddenCategoryIds}
              onMapVisibilityChange={onMapVisibilityChange}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- Main export ----

/**
 * DEC-024 Phase 1 — route-level category summary strip.
 *
 * Renders filterable, individually-hideable chips for each category that
 * has at least one feature on the current route. Returns null when there
 * are no route features (e.g., initial demo route with no corridor data).
 */
export default function RouteCategorySummary({
  features,
  categories,
  filterCategoryId,
  onFilterChange,
  hiddenCategoryIds,
  onMapVisibilityChange,
}: RouteCategorySummaryProps) {
  const chipEntries = useMemo(
    () => buildChipEntries(features, categories),
    [features, categories],
  );

  const supports = chipEntries.filter((e) => e.category.kind === "aid");
  const obstacles = chipEntries.filter((e) => e.category.kind === "obstacle");

  if (chipEntries.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="route-summary-strip-heading">
      <h2 id="route-summary-strip-heading" className="sr-only">
        {en.routeCategorySummaryHeading}
      </h2>
      <div className="flex flex-col gap-[var(--space-4)]">
        {supports.length > 0 && (
          <ChipGroup
            headingId="route-supports-heading"
            heading={en.routeSupportsHeading}
            chips={supports}
            filterCategoryId={filterCategoryId}
            onFilterChange={onFilterChange}
            hiddenCategoryIds={hiddenCategoryIds}
            onMapVisibilityChange={onMapVisibilityChange}
          />
        )}
        {obstacles.length > 0 && (
          <ChipGroup
            headingId="route-obstacles-heading"
            heading={en.routeObstaclesHeading}
            chips={obstacles}
            filterCategoryId={filterCategoryId}
            onFilterChange={onFilterChange}
            hiddenCategoryIds={hiddenCategoryIds}
            onMapVisibilityChange={onMapVisibilityChange}
          />
        )}
      </div>
    </section>
  );
}
