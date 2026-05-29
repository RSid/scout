import Link from "next/link";

const GITHUB_REPO = "https://github.com/RSid/scout";
const DECISIONS_DOC = `${GITHUB_REPO}/blob/main/docs/03-decisions.md`;
const BARRIER_REPORT_URL = `${GITHUB_REPO}/issues/new?template=accessibility-barrier.yml`;

const LINK_CLASS =
  "font-semibold text-[color:var(--color-link)] underline underline-offset-4";

export default function AccessibilityPage() {
  return (
    <article className="mx-auto max-w-[var(--measure-body)] space-y-[var(--space-8)] px-[var(--space-6)] py-[var(--space-14)]">
      <header className="space-y-[var(--space-3)]">
        <h1 className="text-3xl font-semibold text-[color:var(--color-text)]">
          Accessibility
        </h1>
        <p className="text-[color:var(--color-text-muted)]">
          Scout is built for people with mobility, vision, and other access needs. This
          page explains what Scout aims for, how that gets checked, and how to tell us
          when something blocks you.
        </p>
      </header>

      <section
        aria-labelledby="accessibility-target-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="accessibility-target-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          What Scout aims for
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          Scout targets WCAG 2.2 Level AA across the whole product. WCAG — the Web
          Content Accessibility Guidelines — is the international standard for
          accessible websites. Where it doesn&apos;t get in the reader&apos;s way, Scout
          also follows three stricter (AAA) points: higher color contrast, a clear sense
          of where you are in a multi-step flow, and a lower-secondary reading level for
          its writing.
        </p>
      </section>

      <section
        aria-labelledby="accessibility-checks-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="accessibility-checks-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          How that gets checked
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          Every page is checked automatically for accessibility problems (using a tool
          called axe-core) before any change ships, and a change can&apos;t go live with
          a known WCAG 2.2 AA problem. People also test Scout by keyboard and with
          screen readers — VoiceOver, NVDA, and TalkBack.
        </p>
        <p className="text-[color:var(--color-text-muted)]">
          The first full manual review hasn&apos;t been finished yet. Until it has,
          treat this page as a statement of what Scout aims for, not a finished audit.
        </p>
      </section>

      <section
        aria-labelledby="accessibility-decisions-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="accessibility-decisions-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          Where the decisions live
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          Scout&apos;s accessibility decisions are public. You can read what Scout
          commits to, and why, in the open repository.
        </p>
        <p className="text-[color:var(--color-text-muted)]">
          <Link
            href={DECISIONS_DOC}
            className={LINK_CLASS}
            rel="noopener noreferrer"
            target="_blank"
          >
            Browse Scout&apos;s accessibility decisions on GitHub
          </Link>
        </p>
      </section>

      <section
        aria-labelledby="accessibility-report-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="accessibility-report-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          Report a barrier
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          If something in Scout blocks you, please tell us. A report goes to the same
          public issue tracker the rest of Scout uses. Don&apos;t use the private
          security channel for access barriers — that&apos;s only for security
          vulnerabilities.
        </p>
        <p className="text-[color:var(--color-text-muted)]">
          <Link
            href={BARRIER_REPORT_URL}
            className={LINK_CLASS}
            rel="noopener noreferrer"
            target="_blank"
          >
            Open an accessibility report on GitHub
          </Link>
        </p>
      </section>

      <section
        aria-labelledby="accessibility-dates-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="accessibility-dates-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          Dates
        </h2>
        <ul className="list-disc space-y-[var(--space-2)] pl-[var(--space-6)] text-[color:var(--color-text)]">
          <li>Audit last signed off: not yet — the first manual review is pending.</li>
          <li>Page last reviewed: May 2026.</li>
        </ul>
      </section>
    </article>
  );
}
