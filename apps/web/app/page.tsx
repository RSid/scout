import Link from "next/link";

export default function HomePage() {
  return (
    <article className="mx-auto grid max-w-[var(--measure-body)] gap-[var(--space-6)] px-[var(--space-6)] py-[var(--space-16)]">
      <h1 className="flex items-center gap-[var(--space-3)] font-sans text-4xl font-semibold tracking-tight text-[color:var(--color-text)]">
        <svg
          viewBox="0 0 24 24"
          width="32"
          height="32"
          aria-hidden="true"
          className="shrink-0 text-[color:var(--color-accent)]"
        >
          <circle
            cx="10"
            cy="13"
            r="7"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          />
          <circle cx="10" cy="13" r="2.3" fill="currentColor" />
          <path
            d="M 17 8 L 21 4"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
        Scout
      </h1>
      <p className="text-[length:var(--font-size-lg)] leading-[var(--line-height-loose)] text-[color:var(--color-text-muted)]">
        Routes in Washington, DC, paired with public accessibility data.
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
