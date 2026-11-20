/** Plain translation strings for English UI (M2 wires next-intl). */

export type LocaleMessages = Record<string, string>;

/**
 * Owner-approved foot-walking fallback notice (PRD M1-F04, verbatim). Shared by
 * the visible route-summary notice and the route-loaded announcement so eyes
 * and ears get the same words (voice-and-copy §9.1).
 */
const ROUTE_FOOT_WALKING_FALLBACK_NOTICE =
  "We couldn't find a step-free route to this exact spot. In our map data it " +
  "may only connect by steps. This is a standard walking route and may include " +
  "steps, steep slopes or high curbs. Check for an accessible entrance before " +
  "you go.";

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

  /**
   * Appended after base loaded announcement when `fallback_profile_used` is true.
   * Longer than voice §9.5's 12 words on purpose: it is a safety notice, so the
   * full owner-approved text is announced rather than a paraphrase.
   */
  routeAnnouncementWheelchairFallback: ROUTE_FOOT_WALKING_FALLBACK_NOTICE,
  routeWarningsNoticesHeading: "Notices along this route",
  routeSummaryPendingTravelTime: "Calculating…",
  /** Distance/time placeholder before a real route returns (no straight-line estimate). */
  routeSummaryUnavailableValue: "Unavailable",

  /**
   * M1-F04 / M1-F05 route notices. Raw `warnings` codes are never shown; known
   * codes map to the copy below and unknown codes are not rendered.
   */
  /** `fallback_profile:foot-walking` / `fallback_profile_used` (owner-approved, verbatim). */
  routeFootWalkingFallbackNotice: ROUTE_FOOT_WALKING_FALLBACK_NOTICE,
  /**
   * `unverified_segments` lines (PRD M1-F04 copy — proposed, pending owner
   * sign-off). Replace `{distance}` via `unverifiedSegmentNotice`.
   */
  routeUnverifiedSegmentEndTemplate:
    "The last {distance} to this spot isn't part of the step-free route. " +
    "In our map data it may only connect by steps.",
  routeUnverifiedSegmentStartTemplate:
    "The first {distance} from this spot isn't part of the step-free route. " +
    "In our map data it may only connect by steps.",
  /** Map legend entry shown only while a route has unverified stretches. */
  mapUnverifiedSegmentLegend:
    "Dashed line: not part of the step-free route. It may only connect by steps.",

  /** Planner status strip (single home for planner-wide state). */
  plannerPendingTitle: "Finding a route…",
  plannerPendingDetail:
    "We'll show the route, distance, and travel time as soon as it's ready. " +
    "No line is drawn until then.",
  plannerSampleTitle: "Showing a sample route",
  plannerSampleDetail: "Change either address to plan your own route.",

  /** Corridor fetch failed — distinct from "nothing matched" (no longer silent). */
  corridorListingErrorTitle: "Couldn't load nearby features",
  corridorListingErrorDetail:
    "We couldn't refresh the items along your route. Try again once your route " +
    "settles, or widen your categories.",

  /** M1-F09 — parallel corridor list heading (DEC-021 sentence case). */
  alongRouteHeading: "Along your route",
  alongRouteLead:
    "Grouped by block from start toward your destination. Expand any block to see details.",

  /** Block-group expand/collapse toggles (block-grouping feature). */
  blockExpandAll: "Expand all",
  blockCollapseAll: "Collapse all",
  /** Block-group header: "{n} features" count. Replace `{n}`. */
  blockFeatureCountTemplate: "{n} features",
  /** Block-group aid/obstacle summary. Replace `{n}`. */
  blockAidsTemplate: "{n} aids",
  blockAidsSingular: "1 aid",
  blockObstaclesTemplate: "{n} obstacles",
  blockObstaclesSingular: "1 obstacle",

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

/* ---- Busy and rate-limit states (M1-F03, M1-F04, M1-F07) ---- */

/**
 * Copy for when Scout's backend asks the browser to slow down: `RATE_LIMIT`
 * (429, Scout's own per-device limit) or `ROUTE_SERVICE_BUSY` (503, the
 * directions service's daily or per-minute quota is used up). `{when}` is a
 * phrase from `retryWhenPhrase`, never raw seconds.
 */
export const requestLimitMessages = {
  geocodeRateLimitedTemplate:
    "Too many address searches in a short time. Try again {when}.",

  routeBusyTitle: "Route planning is busy",
  routeBusyDetailTemplate:
    "Directions aren't available right now. Try again {when}. " +
    "The map and the accessibility features below still work.",
  /** Live region (≤12 words, §9.5). */
  routeBusyAnnouncementTemplate: "Route planning is busy. Try again {when}.",

  routeRateLimitedTitle: "Too many route requests",
  routeRateLimitedDetailTemplate:
    "Scout limits how many routes one device can plan in a short time. " +
    "Try again {when}. The map and the accessibility features below still work.",
  /** Live region (≤12 words, §9.5). */
  routeRateLimitedAnnouncementTemplate: "Too many route requests. Try again {when}.",

  corridorRateLimitedDetailTemplate:
    "Scout limits how often one device can look up items along a route. " +
    "Try again {when}.",
  corridorTimeoutDetail:
    "Looking up items along this route took too long. Try again in a moment, " +
    "or try a shorter route.",
  corridorTooLargeDetail:
    "This route is too long to list items along it. Try a shorter route.",
  corridorOutsideAreaDetail:
    "Part of this route is outside Washington, DC. Scout lists items in DC only.",
} satisfies LocaleMessages;

/**
 * Turns a `Retry-After` wait into a plain phrase that finishes "Try again …".
 * Long waits name the day instead of a number of hours: a quota can stay
 * closed until tomorrow.
 */
export function retryWhenPhrase(
  seconds: number | undefined,
  now: Date = new Date(),
): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) {
    return "in a little while";
  }
  if (seconds <= 20) {
    return "in a few seconds";
  }
  if (seconds <= 90) {
    return "in about a minute";
  }
  if (seconds < 50 * 60) {
    return `in about ${String(Math.round(seconds / 60))} minutes`;
  }
  if (seconds < 90 * 60) {
    return "in about an hour";
  }
  if (seconds < 6 * 60 * 60) {
    return `in about ${String(Math.round(seconds / 3600))} hours`;
  }
  const retryAt = new Date(now.getTime() + seconds * 1000);
  return retryAt.toDateString() === now.toDateString() ? "later today" : "tomorrow";
}

/** Fills a `{when}` template from `requestLimitMessages`. */
export function withRetryWhen(template: string, when: string): string {
  return template.replace("{when}", when);
}

/* ---- end busy and rate-limit states ---- */

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

/** Block-group feature count, e.g. "3 features". */
export function blockFeatureCount(n: number): string {
  return en.blockFeatureCountTemplate.replace("{n}", String(n));
}

/** Block-group aid count with singular/plural. */
export function blockAidsLabel(n: number): string {
  return n === 1
    ? en.blockAidsSingular
    : en.blockAidsTemplate.replace("{n}", String(n));
}

/** Block-group obstacle count with singular/plural. */
export function blockObstaclesLabel(n: number): string {
  return n === 1
    ? en.blockObstaclesSingular
    : en.blockObstaclesTemplate.replace("{n}", String(n));
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

/**
 * One route-summary line for an M1-F04 unverified stretch, e.g. "The last
 * 135 m to this spot …". Whole meters (at least 1) with a non-breaking space
 * before the unit (voice-and-copy §10.2).
 */
export function unverifiedSegmentNotice(
  position: "start" | "end",
  lengthMeters: number,
): string {
  const meters = Math.max(1, Math.round(lengthMeters));
  const distance = `${String(meters)}\u00A0m`;
  const template =
    position === "start"
      ? en.routeUnverifiedSegmentStartTemplate
      : en.routeUnverifiedSegmentEndTemplate;
  return template.replace("{distance}", distance);
}
