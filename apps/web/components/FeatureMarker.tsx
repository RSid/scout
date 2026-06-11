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
 * Uses category label fragment, verbatim condition text, inspection year clause.
 */
export function FeatureMarkerAriaLabel(
  categoryLabel: string,
  condition: string | undefined | null,
  inspectedYear: number | null | undefined,
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
  return `${categoryLabel}, ${phrase}, ${inspectionFrag}`;
}
