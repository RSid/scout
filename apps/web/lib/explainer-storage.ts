"use client";

/**
 * DEC-010: reuse the scout.* namespace for per-feature UI flags.
 * The explainer dismissal is stored here rather than inventing a new top-level key.
 */
const EXPLAINER_KEY = "scout.markerDensityExplainerDismissed.v1";

export function isMarkerDensityExplainerDismissed(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.localStorage.getItem(EXPLAINER_KEY) === "true";
}

export function dismissMarkerDensityExplainer(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(EXPLAINER_KEY, "true");
}

export { EXPLAINER_KEY };
