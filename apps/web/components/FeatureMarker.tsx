import { en } from "@/lib/i18n/messages";

function sanitizedCondition(condition: string | undefined): string {
  const t = typeof condition === "string" ? condition.trim() : "";
  return t.length > 0 ? t : conditionUnknownAria();
}

function conditionUnknownAria(): string {
  return en.conditionUnknownForAria;
}

/**
 * Accessible name fragment for marker controls (voice-and-copy §9.1, ≤10 words).
 * Uses category label fragment, verbatim condition text, optional location
 * ("on 14th St NW" / restroom address, M2-F24), and inspection year clause.
 */
export function FeatureMarkerAriaLabel(
  categoryLabel: string,
  condition: string | undefined | null,
  inspectedYear: number | null | undefined,
  location?: string | null | undefined,
): string {
  const phrase = sanitizedCondition(condition ?? "");
  const year =
    inspectedYear !== null &&
    inspectedYear !== undefined &&
    Number.isFinite(inspectedYear)
      ? inspectedYear
      : null;
  const inspectionFrag =
    year === null
      ? en.inspectionDateUnknownAriaFragment
      : `${en.lastInspectedShort} ${year}`;
  const locationFrag =
    typeof location === "string" && location.trim().length > 0
      ? `, ${location.trim()}`
      : "";
  return `${categoryLabel}, ${phrase}${locationFrag}, ${inspectionFrag}`;
}
