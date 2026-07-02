import Link from "next/link";

const GITHUB_REPO = "https://github.com/RSid/scout";

const FOOTER_LINK_CLASS =
  "inline-flex min-h-tap items-center font-semibold text-[color:var(--color-link)] underline underline-offset-4";

export default function Footer() {
  return (
    <footer className="border-t border-border">
      <nav
        aria-label="Footer"
        className="mx-auto flex max-w-[var(--measure-body)] flex-wrap gap-x-[var(--space-6)] gap-y-[var(--space-3)] px-[var(--space-6)] py-[var(--space-8)] text-[color:var(--color-text-muted)]"
      >
        <Link href="/about" className={FOOTER_LINK_CLASS}>
          About Scout
        </Link>
        <Link href="/plan" className={FOOTER_LINK_CLASS}>
          Route planner
        </Link>
        <Link href="/privacy" className={FOOTER_LINK_CLASS}>
          Privacy policy
        </Link>
        <Link href="/accessibility" className={FOOTER_LINK_CLASS}>
          Accessibility statement
        </Link>
        <Link
          href={GITHUB_REPO}
          className={FOOTER_LINK_CLASS}
          rel="noopener noreferrer"
          target="_blank"
        >
          Source on GitHub
        </Link>
      </nav>
    </footer>
  );
}
