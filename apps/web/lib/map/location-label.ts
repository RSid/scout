/**
 * Shared resolution of a feature's location label (M2-F24, DEC-027).
 *
 * One code path for the list row, the popup, and the marker aria-label so the
 * "on 14th St NW" / restroom-address fallback logic never drifts between
 * surfaces. Structured so an intersection framing ("14th St NW & P St NW") can
 * replace the single street later without touching callers.
 */

import { onStreetLabel } from "@/lib/i18n/messages";

const REFUGE_SOURCE_DATASET = "refugerestrooms";

/** Where a resolved location came from — drives copy ("on {street}" vs. raw). */
export type LocationLabelSource = "street" | "address";

export type ResolvedLocationLabel = Readonly<{
  /** Display text ready for the visible summary and the sr-only line. */
  text: string;
  source: LocationLabelSource;
}>;

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * Resolve a feature's location label from its properties.
 *
 * Precedence: a derived `street_name` wins; restroom rows fall back to
 * `attributes.address`; otherwise there is no location to show (caller omits
 * the segment and its separator).
 */
export function resolveLocationLabel(
  properties: Record<string, unknown> | undefined | null,
): ResolvedLocationLabel | null {
  if (properties === undefined || properties === null) {
    return null;
  }

  const street = nonEmptyString(properties["street_name"]);
  if (street !== null) {
    return { text: onStreetLabel(street), source: "street" };
  }

  const sourceDataset = properties["source_dataset"];
  if (sourceDataset === REFUGE_SOURCE_DATASET) {
    const attributes = properties["attributes"];
    if (typeof attributes === "object" && attributes !== null) {
      const address = nonEmptyString(
        (attributes as Record<string, unknown>)["address"],
      );
      if (address !== null) {
        // Address fallback renders verbatim — no "on" prefix (prompt §6).
        return { text: address, source: "address" };
      }
    }
  }

  return null;
}
