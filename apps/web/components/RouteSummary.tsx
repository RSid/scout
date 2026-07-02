"use client";

import type { RouteSummaryPayload } from "@/lib/api";
import { en } from "@/lib/i18n/messages";

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
      ? en.routeSummaryPendingWalkingTime
      : en.routeSummaryUnavailableValue;

  const showFallbackSentence = summary?.fallbackProfileUsed === true;

  const warningItems =
    summary?.warnings.map((warning, index) => ({
      key: `${index}:${String(warning).slice(0, 96)}`,
      text: String(warning),
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

      {showFallbackSentence ? (
        <p className="mt-[var(--space-5)] text-sm text-[color:var(--color-text)]">
          {en.routeProfileFallbackNote}
        </p>
      ) : null}

      {warningItems.length > 0 ? (
        <div className="mt-[var(--space-5)]">
          <p
            id="scout-route-warnings-heading"
            className="text-sm font-semibold text-[color:var(--color-text-muted)]"
          >
            {en.routeWarningsNoticesHeading}
          </p>
          <ul
            aria-labelledby="scout-route-warnings-heading"
            className="mt-[var(--space-3)] flex flex-wrap gap-2"
          >
            {warningItems.map((warning) => (
              <li key={warning.key}>
                <span className="inline-flex max-w-full rounded-tokenSm border border-[color:var(--color-warning-border)] bg-[color:var(--color-warning-surface)] px-[var(--space-3)] py-[var(--space-2)] text-sm font-medium text-[color:var(--color-warning-text)]">
                  {warning.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
