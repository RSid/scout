import Link from "next/link";

import DisclaimerAnchorFocus from "@/components/about/DisclaimerAnchorFocus";
import {
  DATA_SOURCES,
  type DataSource,
  isInspectionOutdated,
} from "@/lib/data-sources";
import { DISCLAIMER_L1_COPY } from "@/lib/disclaimer-copy";

const GITHUB_REPO = "https://github.com/RSid/scout";

function DataSourceNote({
  row,
  referenceYear,
}: {
  row: DataSource;
  referenceYear: number;
}) {
  if (row.lastInspectedYear === null) {
    return (
      <p className="text-sm text-[color:var(--color-text-muted)]">
        Inspection date unknown
      </p>
    );
  }

  const chip = !isInspectionOutdated(row.lastInspectedYear, referenceYear) ? null : (
    <span
      className="inline-flex items-center rounded-tokenSm border border-[color:var(--color-warning-border)] bg-[color:var(--color-warning-surface)] px-2 py-0.5 text-xs font-medium text-[color:var(--color-warning-text)]"
      data-testid="freshness-chip"
    >
      {`Data may be outdated (last inspected ${row.lastInspectedYear})`}
    </span>
  );

  return (
    <div className="mt-[var(--space-2)] flex flex-wrap items-center gap-[var(--space-2)] text-sm">
      <span className="text-[color:var(--color-text-muted)]">{`Last inspected: ${String(row.lastInspectedYear)}`}</span>
      {chip}
    </div>
  );
}

export default function AboutPage() {
  const referenceYear = new Date().getFullYear();

  return (
    <>
      <DisclaimerAnchorFocus />
      <article className="mx-auto max-w-[var(--measure-body)] space-y-[var(--space-10)] px-[var(--space-6)] py-[var(--space-14)]">
        <header className="space-y-[var(--space-4)]">
          <h1 className="font-sans text-4xl font-semibold tracking-tight text-[color:var(--color-text)]">
            About Scout
          </h1>
          <p className="text-[length:var(--font-size-lg)] leading-[var(--line-height-relaxed)] text-[color:var(--color-text-muted)]">
            Scout previews walking routes in Washington, DC and surfaces public
            accessibility data alongside them — a planning aid, not turn-by-turn
            navigation.
          </p>
          <Link
            href="/plan"
            className="inline-flex min-h-tap items-center rounded-tokenMd bg-accent px-[var(--space-5)] py-[var(--space-4)] font-semibold text-[color:var(--color-on-accent)] focus-visible:btn-accent-double-ring-dark"
          >
            Open planner
          </Link>
        </header>

        <section className="space-y-[var(--space-5)]" aria-labelledby="sources-heading">
          <h2
            id="sources-heading"
            className="text-2xl font-semibold text-[color:var(--color-text)]"
          >
            Data sources
          </h2>
          <p className="text-[color:var(--color-text-muted)]">
            Scout pulls from public datasets: Americans with Disabilities Act (ADA)
            inspections published by DC OpenData, plus community sources like Refuge
            Restrooms and OpenStreetMap. Where DC publishes an inspection year,
            you&apos;ll see it; community sources don&apos;t, so we mark those as
            unknown. Scout doesn&apos;t claim these datasets are complete — a support or
            obstacle missing here may still exist in real life.
          </p>
          <ul className="divide-y divide-border rounded-tokenLg border border-border">
            {DATA_SOURCES.map((row) => (
              <li key={row.id} className="px-[var(--space-5)] py-[var(--space-5)]">
                <Link
                  href={row.url}
                  className="text-lg font-semibold text-[color:var(--color-link)] underline underline-offset-4 hover:text-accent"
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {row.label}
                </Link>
                <DataSourceNote referenceYear={referenceYear} row={row} />
              </li>
            ))}
          </ul>
        </section>

        <section
          aria-labelledby="online-services-heading"
          className="space-y-[var(--space-5)]"
        >
          <h2
            id="online-services-heading"
            className="text-2xl font-semibold text-[color:var(--color-text)]"
          >
            Search &amp; routing services
          </h2>
          <p className="text-[color:var(--color-text-muted)]">
            Scout pulls address suggestions from District of Columbia open data —
            specifically the&nbsp;
            <Link
              href="https://opendata.dc.gov/pages/addressing-in-dc"
              className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
              rel="noopener noreferrer"
              target="_blank"
            >
              Master Address Repository
            </Link>{" "}
            (MAR) curated by OCTO&apos;s GIS program. Addresses are refreshed
            periodically and loaded into Scout&apos;s servers; no third-party geocoder
            is involved at autocomplete time (<code>/api/geocode/search</code>). Routing
            still uses{" "}
            <Link
              href="https://openrouteservice.org/"
              className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
              rel="noopener noreferrer"
              target="_blank"
            >
              OpenRouteService
            </Link>
            , which computes wheelchair-aware directions over{" "}
            <Link
              href="https://www.openstreetmap.org/copyright"
              className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
              rel="noopener noreferrer"
              target="_blank"
            >
              OpenStreetMap
            </Link>
            .
          </p>
        </section>

        <section
          id="disclaimer"
          aria-labelledby="disclaimer-heading"
          className="space-y-[var(--space-4)] rounded-tokenLg border border-[color:var(--color-warning-border)] bg-[color:var(--color-warning-surface)] p-[var(--space-6)] text-[color:var(--color-warning-text)]"
        >
          <h2
            id="disclaimer-heading"
            tabIndex={-1}
            className="scroll-mt-[var(--space-6)] text-2xl font-semibold text-[color:var(--color-warning-text)] outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            About Scout&apos;s data
          </h2>
          <p>{DISCLAIMER_L1_COPY}</p>
        </section>

        <section className="space-y-[var(--space-4)]" aria-labelledby="license-heading">
          <h2
            id="license-heading"
            className="text-2xl font-semibold text-[color:var(--color-text)]"
          >
            License &amp; source code
          </h2>
          <p className="text-[color:var(--color-text-muted)]">
            Scout&apos;s source is published under AGPL-3.0. You can read the full
            license and browse the code on GitHub.
          </p>
          <ul className="list-disc space-y-[var(--space-2)] pl-[var(--space-6)] text-[color:var(--color-text)]">
            <li>
              <Link
                href={`${GITHUB_REPO}/blob/main/LICENSE`}
                className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
                rel="noopener noreferrer"
                target="_blank"
              >
                Read the AGPL-3.0 license
              </Link>
            </li>
            <li>
              <Link
                href={GITHUB_REPO}
                className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
                rel="noopener noreferrer"
                target="_blank"
              >
                Browse Scout on GitHub
              </Link>
            </li>
          </ul>
        </section>

        <section className="space-y-[var(--space-4)]" aria-labelledby="contact-heading">
          <h2
            id="contact-heading"
            className="text-2xl font-semibold text-[color:var(--color-text)]"
          >
            Contact
          </h2>
          <p className="text-[color:var(--color-text-muted)]">
            For product bugs, open a GitHub Issue. For security issues, please use
            GitHub&apos;s private security advisories instead of public Issues.
          </p>
          <ul className="list-disc space-y-[var(--space-2)] pl-[var(--space-6)] text-[color:var(--color-text)]">
            <li>
              <Link
                href={`${GITHUB_REPO}/issues`}
                className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
              >
                GitHub Issues
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
      </article>
    </>
  );
}
