"use client";

import type { ReactElement } from "react";

export type StatusSeverity = "info" | "pending" | "warning" | "error";

type StatusStripProps = Readonly<{
  severity: StatusSeverity;
  title: string;
  detail?: string;
  /** Extra classes for layout concerns (e.g. sticky positioning) set by the parent. */
  className?: string;
}>;

/** Per-severity container + icon tints. Color is paired with an icon shape and
 *  the text label, never carrying meaning on its own (DEC-015 / WCAG 1.4.1). */
const SEVERITY_CLASSES: Record<
  StatusSeverity,
  Readonly<{ container: string; glyph: string }>
> = {
  info: {
    container:
      "border-[color:var(--color-border-strong)] border-l-[color:var(--color-link)] bg-surface-elevated text-[color:var(--color-text)]",
    glyph: "text-[color:var(--color-link)]",
  },
  pending: {
    container:
      "border-[color:var(--color-border-strong)] border-l-[color:var(--color-text-muted)] bg-surface-elevated text-[color:var(--color-text)]",
    glyph: "text-[color:var(--color-text-muted)]",
  },
  warning: {
    container:
      "border-[color:var(--color-warning-border)] border-l-[color:var(--color-warning-border)] bg-[color:var(--color-warning-surface)] text-[color:var(--color-warning-text)]",
    glyph: "text-[color:var(--color-warning-border)]",
  },
  error: {
    container:
      "border-[color:var(--color-danger-border)] border-l-[color:var(--color-danger-border)] bg-[color:var(--color-danger-surface)] text-[color:var(--color-danger-text)]",
    glyph: "text-[color:var(--color-danger-border)]",
  },
};

function SeverityGlyph({
  severity,
}: Readonly<{ severity: StatusSeverity }>): ReactElement {
  if (severity === "pending") {
    return (
      <span
        aria-hidden
        className="inline-block h-[18px] w-[18px] animate-spin rounded-full border-2 border-[color:var(--color-border-strong)] border-t-[color:var(--color-text-muted)] motion-reduce:animate-none"
      />
    );
  }

  if (severity === "warning") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
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

  if (severity === "error") {
    return (
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
        <polygon
          points="8,2 16,2 22,8 22,16 16,22 8,22 2,16 2,8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="M9 9 L15 15 M15 9 L9 15"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  // info
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="12" cy="7.5" r="1.4" fill="currentColor" />
      <rect x="11" y="10.5" width="2" height="7" rx="1" fill="currentColor" />
    </svg>
  );
}

export default function StatusStrip({
  severity,
  title,
  detail,
  className,
}: StatusStripProps) {
  const styles = SEVERITY_CLASSES[severity];

  return (
    <div
      data-testid="scout-planner-status"
      data-severity={severity}
      className={`flex items-start gap-[var(--space-3)] rounded-tokenMd border border-l-4 p-[var(--space-4)] ${styles.container} ${className ?? ""}`}
    >
      <span className={`mt-[2px] flex-none ${styles.glyph}`}>
        <SeverityGlyph severity={severity} />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {detail !== undefined ? <p className="mt-[2px] text-sm">{detail}</p> : null}
      </div>
    </div>
  );
}
