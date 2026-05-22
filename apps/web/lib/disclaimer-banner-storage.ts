"use client";

/**
 * Per-session dismissibility for the L2 disclaimer banner (DEC-010).
 *
 * Uses `sessionStorage` (not `localStorage`) so the banner re-appears on every
 * new tab or browser session — matching the "always informed" intent of
 * DEC-010 while not shouting at returning users within a single session.
 */
const BANNER_DISMISSED_KEY = "scout.disclaimer-banner.dismissed.v1";

export function isBannerDismissedThisSession(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return window.sessionStorage.getItem(BANNER_DISMISSED_KEY) === "true";
}

export function markBannerDismissedThisSession(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.sessionStorage.setItem(BANNER_DISMISSED_KEY, "true");
}

export { BANNER_DISMISSED_KEY };
