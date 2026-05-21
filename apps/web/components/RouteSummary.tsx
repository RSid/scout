"use client";

type RouteSummaryProps = Readonly<{
  distanceLabel: string;
  warnings: readonly string[];
}>;

export default function RouteSummary({
  distanceLabel,

  warnings,
}: RouteSummaryProps) {
  return (
    <div
      role="region"
      aria-label="Walking route approximation"
      className="rounded-tokenLg border border-border bg-surface-elevated p-[var(--space-5)] shadow-modal"
    >
      <dl className="space-y-[var(--space-3)]">
        <div>
          <dt className="text-sm font-semibold text-[color:var(--color-text-muted)]">
            Distance approximation
          </dt>
          <dd className="text-3xl font-bold text-[color:var(--color-text)]">
            {distanceLabel}
          </dd>
        </div>
      </dl>
      <div className="mt-[var(--space-4)] text-sm text-[color:var(--color-text-muted)]">
        Important notes:
      </div>
      <ul className="mt-[var(--space-2)] list-disc space-y-1 pl-[var(--space-5)]">
        <li>Powered by volunteered accessibility data snapshots.</li>
        {warnings.map((item, index) => (
          <li key={`${index}:${item.slice(0, 64)}`}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
