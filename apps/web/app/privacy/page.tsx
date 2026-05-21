export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-[var(--measure-body)] space-y-[var(--space-5)] px-[var(--space-6)] py-[var(--space-14)]">
      <h1 className="text-3xl font-semibold text-[color:var(--color-text)]">Privacy stance</h1>
      <p className="text-[color:var(--color-text-muted)]">
        M1 ships without third-party analytics or advertising scripts (`NF-PRIV-01`).
        Addresses you type remain in-session unless explicitly submitted to nominatim; prefer the
        future `/api/geocode` proxy to centralize quotas.
      </p>
      <p className="text-[color:var(--color-text-muted)]">
        Location requests only fire after activating the corresponding button inside the planner.
      </p>
    </article>
  );
}
