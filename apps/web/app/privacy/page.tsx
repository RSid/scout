import Link from "next/link";

const GITHUB_REPO = "https://github.com/RSid/scout";

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-[var(--measure-body)] space-y-[var(--space-8)] px-[var(--space-6)] py-[var(--space-14)]">
      <header className="space-y-[var(--space-3)]">
        <h1 className="text-3xl font-semibold text-[color:var(--color-text)]">
          Privacy
        </h1>
        <p className="text-[color:var(--color-text-muted)]">
          Scout is built for people planning walking routes. It tries to know as little
          about you as possible.
        </p>
      </header>

      <section
        aria-labelledby="privacy-collect-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="privacy-collect-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          What Scout collects
        </h2>
        <ul className="list-disc space-y-[var(--space-2)] pl-[var(--space-6)] text-[color:var(--color-text)]">
          <li>
            <strong>Nothing about you, by default.</strong> Scout doesn&apos;t include
            third-party analytics, advertising scripts, or social-media widgets.
          </li>
          <li>
            <strong>The address you type</strong> goes to Scout&apos;s servers where it
            is matched against the District&apos;s public Master Address Repository
            snapshot (MAR). Nothing is forwarded to an external geocoding API for
            autocomplete and Scout doesn&apos;t store what you typed.
          </li>
          <li>
            <strong>Coordinates from your plan</strong> (start and destination) flow
            through Scout to calculate walking directions. They aren&apos;t stored by
            Scout.
          </li>
          <li>
            <strong>Your IP address</strong> appears in Scout&apos;s server logs (used
            to catch abuse), kept for no more than seven days, then deleted.
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="privacy-browser-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="privacy-browser-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          What Scout keeps in your browser
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          Your browser stores a few things locally. None are sent to Scout&apos;s
          servers.
        </p>
        <ul className="list-disc space-y-[var(--space-2)] pl-[var(--space-6)] text-[color:var(--color-text)]">
          <li>
            Your <strong>accessibility preferences</strong> (which categories to show on
            the map), in <code>localStorage</code>. They stay until you clear site data
            for this site.
          </li>
          <li>
            A flag that records whether you&apos;ve seen the intro, in{" "}
            <code>localStorage</code>, so the onboarding doesn&apos;t open every visit.
          </li>
          <li>
            A flag that records whether you dismissed the data notice this session, in{" "}
            <code>sessionStorage</code>. It resets when you close the tab.
          </li>
        </ul>
        <p className="text-[color:var(--color-text-muted)]">
          You can clear all of this through your browser&apos;s site-data tools.
        </p>
      </section>

      <section
        aria-labelledby="privacy-location-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="privacy-location-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          Location
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          Scout never asks for your location until you select &ldquo;Use my
          location&rdquo; in the planner. Your browser controls the prompt and Scout
          only receives the coordinates if you grant permission.
        </p>
      </section>

      <section
        aria-labelledby="privacy-cookies-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="privacy-cookies-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          Cookies
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          Scout doesn&apos;t set cookies for tracking. The browser storage described
          above is the only state Scout keeps client-side.
        </p>
      </section>

      <section
        aria-labelledby="privacy-questions-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="privacy-questions-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          Privacy questions
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          Scout has no accounts and no contact form. For a privacy question, or to flag
          something on this page, open a GitHub issue. To report a security or privacy
          vulnerability, use GitHub&apos;s private security advisories instead of a
          public issue.
        </p>
        <ul className="list-disc space-y-[var(--space-2)] pl-[var(--space-6)] text-[color:var(--color-text)]">
          <li>
            <Link
              href={`${GITHUB_REPO}/issues`}
              className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
            >
              Open a GitHub issue
            </Link>
          </li>
          <li>
            <Link
              href={`${GITHUB_REPO}/security`}
              className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
              rel="noopener noreferrer"
            >
              Security disclosures (GitHub Security tab)
            </Link>
          </li>
        </ul>
      </section>

      <section
        aria-labelledby="privacy-changes-heading"
        className="space-y-[var(--space-3)]"
      >
        <h2
          id="privacy-changes-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          Changes
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          If this page changes, the change lands in Scout&apos;s{" "}
          <Link
            href={GITHUB_REPO}
            className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
            rel="noopener noreferrer"
            target="_blank"
          >
            public GitHub repo
          </Link>{" "}
          so you can see the history.
        </p>
      </section>
    </article>
  );
}
