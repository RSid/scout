"use client";

import { useCallback, useState } from "react";

import {
  dismissMarkerDensityExplainer,
  isMarkerDensityExplainerDismissed,
} from "@/lib/explainer-storage";
import { en } from "@/lib/i18n/messages";

/** Inline × close icon, sized for legibility at 16 px. */
function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="13" y1="3" x2="3" y2="13" />
      <line x1="3" y1="3" x2="13" y2="13" />
    </svg>
  );
}

/**
 * DEC-024 Phase 1 — first-visit inline explainer about marker density.
 *
 * Shown on page mount (user choice: `on_mount`). Dismissed via a button that
 * persists the flag in localStorage under the DEC-010 namespace. Honors
 * `prefers-reduced-motion` (no CSS transition on hide — we just unmount).
 */
export default function RouteMarkerExplainer() {
  const [dismissed, setDismissed] = useState(() => isMarkerDensityExplainerDismissed());

  const handleDismiss = useCallback(() => {
    dismissMarkerDensityExplainer();
    setDismissed(true);
  }, []);

  if (dismissed) {
    return null;
  }

  return (
    <div
      role="note"
      aria-label={en.markerDensityExplainerLandmarkLabel}
      data-testid="route-marker-explainer"
      className="relative rounded-tokenMd border border-border bg-surface-elevated py-[var(--space-3)] pl-[var(--space-4)] pr-[var(--space-14)] text-sm text-[color:var(--color-text-muted)]"
    >
      <p>{en.markerDensityExplainerCopy}</p>
      {/* 44 × 44 px touch target satisfies WCAG 2.5.5. */}
      <button
        type="button"
        aria-label={en.markerDensityExplainerDismiss}
        onClick={handleDismiss}
        className="absolute right-[var(--space-2)] top-[var(--space-2)] flex h-11 w-11 items-center justify-center rounded-tokenSm text-[color:var(--color-text-muted)] hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <CloseIcon />
      </button>
    </div>
  );
}
