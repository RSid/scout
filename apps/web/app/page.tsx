import Link from "next/link";

export default function HomePage() {
  return (
    <article className="mx-auto grid max-w-[var(--measure-body)] gap-[var(--space-6)] px-[var(--space-6)] py-[var(--space-16)]">
      <h1 className="font-sans text-4xl font-semibold tracking-tight text-[color:var(--color-text)]">
        Scout
      </h1>
      <p className="text-[length:var(--font-size-lg)] leading-[var(--line-height-relaxed)] text-[color:var(--color-text-muted)]">
        Walking routes in Washington, DC, paired with public accessibility data — a
        planning aid, not turn-by-turn navigation.
      </p>
      <div className="flex flex-wrap gap-[var(--space-4)]">
        <Link
          href="/plan"
          className="inline-flex min-h-tap min-w-[140px] items-center justify-center rounded-tokenMd bg-accent px-[var(--space-5)] py-[var(--space-4)] font-semibold text-[color:var(--color-on-accent)] focus-visible:btn-accent-double-ring-dark"
        >
          Open planner
        </Link>
        <Link
          href="/about"
          className="inline-flex min-h-tap items-center justify-center rounded-tokenMd border border-border px-[var(--space-5)] py-[var(--space-4)] font-semibold text-[color:var(--color-text)] focus-visible:btn-accent-double-ring-dark"
        >
          About Scout
        </Link>
      </div>
    </article>
  );
}
