export default function AboutPage() {
  return (
    <article className="mx-auto max-w-[var(--measure-body)] space-y-[var(--space-6)] px-[var(--space-6)] py-[var(--space-14)]">
      <h1 className="text-3xl font-semibold text-[color:var(--color-text)]">About Scout</h1>
      <p className="text-[color:var(--color-text-muted)]">
        Scout relies on volunteered observations. Field teams may miss hazards, closures, or sudden
        construction. Always corroborate with local signage and municipality updates.
      </p>
      <section
        id="disclaimer"
        className="rounded-tokenLg border border-[color:var(--color-warning-border)] bg-[color:var(--color-warning-surface)] p-[var(--space-5)] text-[color:var(--color-warning-text)]"
      >
        <h2 className="text-xl font-semibold">Crowdsourcing disclaimer anchor</h2>
        <p className="mt-[var(--space-3)] text-sm">
          This anchor exists for auditors linking directly to the disclaimer copy referenced in DEC-010
          mockups (`design/screens/onboarding-modal.html`).
        </p>
      </section>
    </article>
  );
}
