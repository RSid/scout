/** Plain translation strings for English UI (M2 wires next-intl). */

export type LocaleMessages = Record<string, string>;

export const en = {
  locale: "en",
  scoutTitle: "Scout — walking routes and accessibility data for DC",
  /** M1-F02: short aria-label fragment (≤10 words, PRD §6.1 + voice-and-copy §9.2). */
  mapPlanAriaLabel: "Interactive map of Washington, DC",
  /** Paired keyboard hint; surfaced via aria-describedby on the application landmark. */
  mapPlanKeyboardHint: "Tab to reach map controls. Press M then arrow keys to pan.",

  /** M1-F05: route summary landmark + labels. */
  routeSummaryAriaLabel: "Route summary",
  routeSummaryHeading: "Route summary",
  routeDistanceLabel: "Distance",
  routeDurationLabel: "Walking time",
  routeProfileLabel: "Routing profile",
  routeProfileWheelchair: "Wheelchair-aware route",
  routeProfileFallbackNote:
    "Wheelchair-aware routing wasn't available, so we used standard walking directions.",
  routeApproxFallbackExplanation:
    "Showing a straight-line approximation while routing is unavailable.",
  /** Announced via LiveRegion when `POST /api/route` succeeds (M1-F05.S4). */
  routeAnnouncementLoadedTemplate:
    "Route loaded: {distance_km} kilometers, {minutes} minutes",
  routeAnnouncementApproxFallback:
    "Couldn't load turn-by-turn directions from the planner. Showing a straight-line approximation instead.",

  /** Appended after base loaded announcement when `fallback_profile_used` is true. */
  routeAnnouncementWheelchairFallback:
    "Wheelchair-aware routing wasn't available, so we used standard walking directions.",
  routeWarningsNoticesHeading: "Notices along this route",
  routeSummaryPendingWalkingTime: "Calculating…",
  routeSummaryPendingHint:
    "Finding a walking route for your start and destination. Distance below is a straight-line preview.",
} satisfies LocaleMessages;

function formatDistanceKmForAnnouncement(distanceMeters: number): string {
  const km = distanceMeters / 1000;
  return km >= 100 ? String(Math.round(km)) : String(Math.round(km * 10) / 10);
}

function formatMinutesRounded(durationSeconds: number): number {
  return Math.max(1, Math.round(durationSeconds / 60));
}

/** WCAG polite live-region line after a successful `POST /api/route`. */
export function routeAnnouncementLoaded(
  distanceMeters: number,
  durationSeconds: number,
): string {
  const distanceKm = formatDistanceKmForAnnouncement(distanceMeters);
  const minutes = String(formatMinutesRounded(durationSeconds));

  return en.routeAnnouncementLoadedTemplate
    .replace("{distance_km}", distanceKm)
    .replace("{minutes}", minutes);
}

/** Announced when routing failed and UI falls back to a straight segment. */
export function routeAnnouncementApproxFallback(): string {
  return en.routeAnnouncementApproxFallback;
}
