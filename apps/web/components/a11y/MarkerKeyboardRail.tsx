"use client";

import type { CorridorResponse } from "@/lib/api";
import type { ApiCategory } from "@/lib/api";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useMemo } from "react";

import { FeatureMarkerAriaLabel } from "@/components/FeatureMarker";

type CorridorFeat = CorridorResponse["features"][number];

export type MarkerKeyboardRailProps = Readonly<{
  features: readonly CorridorFeat[];
  categoryById: ReadonlyMap<string, ApiCategory>;
  focusedIndex: number;
  onFocusedIndexChange: (nextIndex: number) => void;
  onActivateRow: (rowIndex: number) => void;
  disabled?: boolean | undefined;
}>;

/** Roving-tab order for corridor Points so keyboard users traverse stops in GeoJSON sequence. */
export default function MarkerKeyboardRail(props: MarkerKeyboardRailProps) {
  const {
    categoryById,
    features,
    focusedIndex,
    onFocusedIndexChange,
    disabled = false,
    onActivateRow,
  } = props;

  const pointRows = useMemo(
    () =>
      features.flatMap((feature): CorridorFeat[] =>
        feature.geometry.type === "Point" ? [feature] : [],
      ),
    [features],
  );

  const cappedIndex = clampIndex(focusedIndex, pointRows.length);

  useEffect(() => {
    if (focusedIndex !== cappedIndex && pointRows.length > 0) {
      onFocusedIndexChange(cappedIndex);
    }
  }, [cappedIndex, focusedIndex, onFocusedIndexChange, pointRows.length]);

  const navigate = useCallback(
    (delta: number) => {
      if (pointRows.length === 0) {
        return;
      }

      const next = clampIndex(cappedIndex + delta, pointRows.length);
      onFocusedIndexChange(next);
      queueMicrotask(() => {
        globalThis.document.getElementById(railDomId(next))?.focus();
      });
    },
    [cappedIndex, onFocusedIndexChange, pointRows.length],
  );

  function handleRailKey(evt: ReactKeyboardEvent<HTMLUListElement>): void {
    if (evt.key === "ArrowDown") {
      evt.preventDefault();
      navigate(1);
    } else if (evt.key === "ArrowUp") {
      evt.preventDefault();
      navigate(-1);
    }
  }

  if (disabled === true || pointRows.length === 0) {
    return null;
  }

  return (
    <div className="sr-only">
      <p id="scout-marker-keyboard-explainer">
        Use arrow keys inside this list to jump stops.
      </p>
      <ul
        aria-describedby="scout-marker-keyboard-explainer"
        aria-label="Stops plotted on your map"
        className="m-0 list-none p-0"
        tabIndex={-1}
        onKeyDown={handleRailKey}
      >
        {pointRows.map((feature, rowIndex) => (
          <li key={`${stableFeatureKey(feature, rowIndex)}-rail-li`}>
            <button
              type="button"
              id={railDomId(rowIndex)}
              aria-label={buttonLabel(categoryById, feature)}
              tabIndex={rowIndex === cappedIndex ? 0 : -1}
              onFocus={() => onFocusedIndexChange(rowIndex)}
              onKeyDown={(evt): void => {
                if (evt.key === "Enter" || evt.key === " ") {
                  evt.preventDefault();
                  onActivateRow(rowIndex);
                }
              }}
            >
              Corridor stop {String(rowIndex + 1)}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function buttonLabel(
  catById: ReadonlyMap<string, ApiCategory>,
  feature: CorridorFeat,
): string {
  const props = feature.properties as Record<string, unknown> | undefined;
  const catId =
    typeof props?.category === "string"
      ? props.category
      : "unknown_mapped_category_row";
  const category = catById.get(catId);
  const label = category?.label ?? catId;
  const condition =
    typeof props?.condition === "string"
      ? props.condition
      : props?.condition === null
        ? undefined
        : "";
  let inspected: number | null = null;

  const maybeYear = props?.inspected_year;
  if (typeof maybeYear === "number" && Number.isFinite(maybeYear)) {
    inspected = maybeYear;
  }
  const safeCondition =
    typeof condition === "string" && condition.trim().length > 0
      ? condition
      : undefined;

  return FeatureMarkerAriaLabel(label, safeCondition, inspected);
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  const safe = Number.isFinite(index) ? index : 0;
  return Math.max(0, Math.min(length - 1, safe));
}

export function railDomId(rowIndex: number): string {
  return `scout-marker-rail-${String(rowIndex)}`;
}

export function corridorPointFeatureIds(
  features: readonly CorridorFeat[],
): CorridorFeat[] {
  return features.filter((feat) => feat.geometry.type === "Point");
}

function stableFeatureKey(feature: CorridorFeat, rowIndex: number): string {
  if (feature.id !== undefined && feature.id !== null) {
    return String(feature.id);
  }
  const props = feature.properties as Record<string, unknown> | undefined;
  if (typeof props?.id === "string") {
    return props.id;
  }

  return `idx-${String(rowIndex)}`;
}
