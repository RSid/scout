/** Plain translation strings for English UI (M2 wires next-intl). */

export type LocaleMessages = Record<string, string>;

export const en = {
  locale: "en",
  scoutTitle: "Scout — routes and accessibility data for DC",
  /** M1-F02: short aria-label fragment (≤10 words, PRD §6.1 + voice-and-copy §9.2). */
  mapPlanAriaLabel: "Interactive map of Washington, DC",
  /** Paired keyboard hint; surfaced via aria-describedby on the application landmark. */
  mapPlanKeyboardHint: "Tab to reach map controls. Press M then arrow keys to pan.",

  /** M1-F05: route summary landmark + labels. */
  routeSummaryAriaLabel: "Route summary",
  routeSummaryHeading: "Route summary",
  routeDistanceLabel: "Distance",
  routeDurationLabel: "Travel time",
  routeProfileFallbackNote:
    "Wheelchair-aware routing wasn't available, so we used standard directions.",
  /** Shown when `POST /api/route` fails (e.g. routing service unreachable). */
  routeUnavailableTitle: "Directions unavailable",
  routeApproxFallbackExplanation:
    "We couldn't reach the routing service, so we can't show directions " +
    "right now. The map and the accessibility features below still work — try " +
    "again in a moment.",
  /** Announced via LiveRegion when `POST /api/route` succeeds (M1-F05.S4). */
  routeAnnouncementLoadedTemplate:
    "Route loaded: {distance_km} kilometers, {minutes} minutes",
  routeAnnouncementApproxFallback:
    "Couldn't load directions from the planner. The map and nearby " +
    "accessibility features still work.",

  /** Appended after base loaded announcement when `fallback_profile_used` is true. */
  routeAnnouncementWheelchairFallback:
    "Wheelchair-aware routing wasn't available, so we used standard directions.",
  routeWarningsNoticesHeading: "Notices along this route",
  routeSummaryPendingTravelTime: "Calculating…",
  /** Distance/time placeholder before a real route returns (no straight-line estimate). */
  routeSummaryUnavailableValue: "Unavailable",

  /** Planner status strip (single home for planner-wide state). */
  plannerPendingTitle: "Finding a route…",
  plannerPendingDetail:
    "We'll show the route, distance, and travel time as soon as it's ready. " +
    "No line is drawn until then.",
  plannerSampleTitle: "Pick a start and a destination",
  plannerSampleDetail:
    "Until you set both points, Scout shows a sample route across DC.",

  /** Corridor fetch failed — distinct from "nothing matched" (no longer silent). */
  corridorListingErrorTitle: "Couldn't load nearby features",
  corridorListingErrorDetail:
    "We couldn't refresh the items along your route. Try again once your route " +
    "settles, or widen your categories.",

  /** M1-F09 — parallel corridor list heading (DEC-021 sentence case). */
  alongRouteHeading: "Along your route",
  alongRouteLead:
    "Listed from start toward your destination, in the order you'd pass them. Expand any row.",

  openOnMap: "Open on map",
  showMapToggle: "Show map",
  hideMapToggle: "Hide map",
  /** Live region (≤12 words, §9.5). */
  mapShownAnnouncement: "Map shown.",

  /** Loading corridor results (paired with spinner per §7.6 when >2s). */
  corridorListingInProgress: "Listing items along your route…",

  /** Live region template after corridor fetch succeeds. Replace `{n}` with digits. */
  corridorItemsListedTemplate: "{n} listed along your route.",

  /**
   * When the API caps returned rows (`meta.truncated`). Replace `{total}` with corridor total count.
   */
  corridorTotalsFootnoteTemplate: "{total} along this corridor in total.",

  /** When corridor fetch fails and list stays empty — offer next step (§7.4). */
  corridorListingFailedBrief:
    "Couldn't refresh corridor items. Try again once your route settles, or widen your categories.",

  /**
   * Empty-state when no rows match preferences (voice-and-copy §7.5 overrides PRD verbatim).
   * Replace `{categories}` suggestion is inline in UI; keep under 25 words total.
   */
  alongRouteEmptyState:
    "Nothing along this route matches your preferences. Turn more categories on, or choose another stop.",

  /** §7.8 canonical strings plus aria fragments §9.1. */
  inspectionUnknownUser: "Inspection date unknown",
  inspectionLastVerifiedTemplate: "Last inspected: {year}",
  dataStaleChipTemplate: "Last inspected {year}",
  /** 1–3 year subtle note (§D). Replace `{year}`. */
  publicDataAsOfYearTemplate: "Public data as of {year}.",

  inspectionDateUnknownAriaFragment: "inspection date unknown",

  categoryFallback: "Mapped item",

  conditionUnknownVisible: "Condition unknown.",
  conditionUnknownForAria: "condition unknown",

  /**
   * Map overlay — shape + color, not color alone (DEC-015 + §6 avoids “markers” jargon).
   */
  mapMarkersLegend: "Shape shows aids vs obstacles. Color adds severity reading.",

  /** Cluster announcement fallback when the category mix can't be read;
   * replace `{n}` with digits. DEC-024 §2 prefers the spelled-out mix below. */
  corridorClusterGroupedTemplate: "{n} features grouped here. Press Enter to zoom in.",

  lastInspectedShort: "last inspected",

  /** Raster marker registration failed mid-load — factual, terse (voice §9.5 ≤12 words). */
  mapSpriteLoadFailure: "Scout couldn't load route icons.",

  /** Map tile / WebGL outage — polite, factual (voice §7.4 tones). */
  mapGenericLoadFailure:
    "Interactive map paused because Scout could not load its local tiles.",
} satisfies LocaleMessages;

/**
 * Location label for a feature sitting on a named street (M2-F24, DEC-027).
 * e.g. `onStreetLabel("14th St NW")` -> "on 14th St NW". Structured so an
 * intersection framing ("14th St NW & P St NW") can replace the single street
 * later without touching callers.
 */
export function onStreetLabel(street: string): string {
  return `on ${street}`;
}

/** §6 house-word labels for obstacle vs mapped support (stores `kind: aid`). */
export function kindObstacleLabel(): string {
  return "Obstacle";
}

export function kindSupportLabel(): string {
  return "Support";
}

export function inspectionUnknownLabel(): string {
  return en.inspectionUnknownUser;
}

/** §7.8 — exactly “Last inspected: YYYY”. */
export function lastInspectedLabel(year: number): string {
  return en.inspectionLastVerifiedTemplate.replace("{year}", String(year));
}

export function freshnessChipText(year: number): string {
  return en.dataStaleChipTemplate.replace("{year}", String(year));
}

export function asOfYearNote(year: number): string {
  return en.publicDataAsOfYearTemplate.replace("{year}", String(year));
}

export function summarizeMetersFromStartRounded(meters: number): string {
  const rounded = meters >= 10 ? Math.round(meters) : Math.round(meters * 10) / 10;
  return `~${String(rounded)} meters from start`;
}

export function corridorItemsAnnouncement(count: number): string {
  return en.corridorItemsListedTemplate.replace("{n}", String(count));
}

/**
 * DEC-024 §2: a cluster's screen-reader text spells out its category mix, e.g.
 * "Cluster of 5: 3 curb ramps, 2 barriers; press Enter to zoom in." Falls back
 * to the bare-count template when no category labels resolve.
 */
export function corridorClusterMixAnnouncement(
  total: number,
  parts: readonly { readonly label: string; readonly count: number }[],
): string {
  if (parts.length === 0) {
    return en.corridorClusterGroupedTemplate.replace("{n}", String(total));
  }
  const mix = parts
    .map((part) => `${String(part.count)} ${part.label.toLowerCase()}`)
    .join(", ");
  return `Cluster of ${String(total)}: ${mix}; press Enter to zoom in.`;
}

/** Polite corridor success line; avoids generic “features” wording (voice §6). */
export function corridorFetchSuccessAnnouncement(
  listedCount: number,
  meta: Readonly<{ truncated: boolean; feature_count_total: number }>,
): string {
  const base = corridorItemsAnnouncement(listedCount);
  if (meta.truncated !== true) {
    return base;
  }
  return `${base} ${en.corridorTotalsFootnoteTemplate.replace(
    "{total}",
    String(meta.feature_count_total),
  )}`;
}

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
