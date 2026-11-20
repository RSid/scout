"use client";

import type { RouteSummaryPayload } from "@/lib/api";
import { en, unverifiedSegmentNotice } from "@/lib/i18n/messages";

export type RouteSummaryMode = "live" | "approx-fallback" | "sample" | "pending";

type RouteSummaryProps = Readonly<{
  summary: RouteSummaryPayload | null;
  mode: RouteSummaryMode;
}>;

/** Human-readable meters or kilometers (rounded) for the summary row */
export function formatRouteDistanceLine(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) {
    throw new RangeError("meters must be a finite positive number.");
  }

  if (meters < 1000) {
    const rounded = Math.round(meters);
    const unit = rounded === 1 ? "meter" : "meters";
    return `${String(rounded)} ${unit}`;
  }

  const km = meters / 1000;
  const label = km >= 100 ? String(Math.round(km)) : String(Math.round(km * 10) / 10);

  const unitLabel = Number(label) === 1 ? "kilometer" : "kilometers";
  return `${label} ${unitLabel}`;
}

/** Whole minutes ≥ 1 for walking time rows */
export function formatWalkingMinutes(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError("seconds must be finite and non-negative.");
  }

  if (seconds === 0) {
    return "";
  }

  const minutes = Math.max(1, Math.round(seconds / 60));
  return `${String(minutes)} ${minutes === 1 ? "minute" : "minutes"}`;
}

/** Backend warning code for the plain foot-walking fallback (M1-F04). */
export const FOOT_WALKING_FALLBACK_WARNING = "fallback_profile:foot-walking";

/**
 * True when the route is the plain foot-walking fallback. Raw `warnings`
 * entries are machine codes (or upstream text) and are never shown to users;
 * this is the only code with user-facing copy today, and any other entry is
 * deliberately not rendered.
 */
export function isFootWalkingFallback(summary: RouteSummaryPayload): boolean {
  return (
    summary.fallbackProfileUsed ||
    summary.warnings.includes(FOOT_WALKING_FALLBACK_WARNING)
  );
}

const NOTICE_CLASSES =
  "flex items-start gap-[var(--space-3)] rounded-tokenMd border border-l-4 " +
  "border-[color:var(--color-warning-border)] bg-[color:var(--color-warning-surface)] " +
  "p-[var(--space-4)] text-[color:var(--color-warning-text)]";

/** Same triangle as the StatusStrip warning glyph: shape + color, never color alone. */
function WarningGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden
      className="mt-[2px] flex-none"
    >
      <path
        d="M12 3 L22 20 L2 20 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <rect x="11" y="9" width="2" height="6" rx="1" fill="currentColor" />
      <circle cx="12" cy="17.5" r="1.3" fill="currentColor" />
    </svg>
  );
}

/** Dashed swatch matching the map's unverified-stretch line, tying the text to the map. */
function DashedLineSwatch() {
  return (
    <svg
      viewBox="0 0 28 8"
      width="28"
      height="8"
      aria-hidden
      className="mt-[6px] flex-none"
    >
      <line
        x1="2"
        y1="4"
        x2="26"
        y2="4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="4 4"
      />
    </svg>
  );
}

export default function RouteSummary({ summary, mode }: RouteSummaryProps) {
  /**
   * Numbers are shown only for a real route (`live`) or the frozen first-load
   * sample. While routing is pending or unavailable we show a textual
   * placeholder rather than a straight-line estimate, which would imply a path
   * that doesn't follow streets.
   */
  const distanceHuman =
    summary !== null ? formatRouteDistanceLine(summary.distanceMeters) : null;

  const walkingDisplay =
    summary !== null && summary.durationSeconds > 0
      ? formatWalkingMinutes(summary.durationSeconds)
      : null;

  const placeholderValue =
    mode === "pending"
      ? en.routeSummaryPendingTravelTime
      : en.routeSummaryUnavailableValue;

  const showFallbackNotice = summary !== null && isFootWalkingFallback(summary);

  const unverifiedLines =
    summary?.unverifiedSegments.map((segment, index) => ({
      key: `${String(index)}:${segment.position}`,
      text: unverifiedSegmentNotice(segment.position, segment.lengthMeters),
    })) ?? [];

  return (
    <section
      aria-labelledby="scout-route-summary-heading"
      aria-label={en.routeSummaryAriaLabel}
      data-testid="scout-route-summary"
      className="rounded-tokenLg border border-border bg-surface-elevated p-[var(--space-5)] shadow-modal"
    >
      <h2
        id="scout-route-summary-heading"
        className="text-xl font-semibold text-[color:var(--color-text)]"
      >
        {en.routeSummaryHeading}
      </h2>

      <dl className="mt-[var(--space-5)] grid grid-cols-1 gap-[var(--space-4)] sm:grid-cols-2">
        <div>
          <dt className="text-sm font-semibold text-[color:var(--color-text-muted)]">
            {en.routeDistanceLabel}
          </dt>
          <dd className="text-2xl font-bold text-[color:var(--color-text)]">
            {distanceHuman ?? (
              <span className="text-lg font-semibold normal-case text-[color:var(--color-text-muted)]">
                {placeholderValue}
              </span>
            )}
          </dd>
        </div>

        <div>
          <dt className="text-sm font-semibold text-[color:var(--color-text-muted)]">
            {en.routeDurationLabel}
          </dt>
          <dd className="text-2xl font-bold text-[color:var(--color-text)]">
            {walkingDisplay ?? (
              <span className="text-lg font-semibold normal-case text-[color:var(--color-text-muted)]">
                {placeholderValue}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {showFallbackNotice ? (
        <div
          data-testid="scout-route-fallback-notice"
          className={`mt-[var(--space-5)] ${NOTICE_CLASSES}`}
        >
          <WarningGlyph />
          <p className="min-w-0 text-base font-medium">
            {en.routeFootWalkingFallbackNotice}
          </p>
        </div>
      ) : null}

      {unverifiedLines.length > 0 ? (
        <div className="mt-[var(--space-5)]">
          <p
            id="scout-route-warnings-heading"
            className="text-sm font-semibold text-[color:var(--color-text-muted)]"
          >
            {en.routeWarningsNoticesHeading}
          </p>
          <ul
            aria-labelledby="scout-route-warnings-heading"
            className="mt-[var(--space-3)] flex flex-col gap-[var(--space-3)]"
          >
            {unverifiedLines.map((line) => (
              <li key={line.key} className={NOTICE_CLASSES}>
                <DashedLineSwatch />
                <span className="min-w-0 text-sm font-medium">{line.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
