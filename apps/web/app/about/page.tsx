import Link from "next/link";

import {
  DATA_SOURCES,
  type DataSource,
  isInspectionOutdated,
} from "@/lib/data-sources";

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
    <article className="mx-auto max-w-[var(--measure-body)] space-y-[var(--space-10)] px-[var(--space-6)] py-[var(--space-14)]">
      <header className="space-y-[var(--space-4)]">
        <h1 className="font-sans text-4xl font-semibold tracking-tight text-[color:var(--color-text)]">
          About{" "}
          <Link
            href="/plan"
            className="text-[color:var(--color-link)] underline underline-offset-4"
          >
            Scout
          </Link>
        </h1>
        <p className="text-[length:var(--font-size-lg)] leading-[var(--line-height-loose)] text-[color:var(--color-text-muted)]">
          Scout previews walking routes in Washington, DC and surfaces public
          accessibility data alongside them. It&apos;s intended for use as a planning
          aid, but it will not have the kind of live and up to date data that you might
          expect from google or apple maps.
        </p>
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
          Restrooms and OpenStreetMap. Where an inspection year is available we have
          annotated it, but community sources often don&apos;t have that available.
        </p>
        <br />
        <ul className="divide-y divide-border rounded-tokenLg border border-border">
          {DATA_SOURCES.map((row) => (
            <li key={row.id} className="px-[var(--space-2)] py-[var(--space-2)]">
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
          (MAR) curated by OCTO&apos;s GIS program. Addresses are refreshed periodically
          and loaded into Scout&apos;s servers.
          <Link
            href="https://openrouteservice.org/"
            className="font-semibold text-[color:var(--color-link)] underline underline-offset-4"
            rel="noopener noreferrer"
            target="_blank"
          >
            OpenRouteService
          </Link>
          , which computes mobility-aware directions over{" "}
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
      <br />
      <section className="space-y-[var(--space-4)]" aria-labelledby="license-heading">
        <h2
          id="license-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          License &amp; source code
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          Scout&apos;s source is published under AGPL-3.0. You can read the full license
          and browse the code on GitHub.
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
              See Scout&apos;s source code on GitHub
            </Link>
          </li>
        </ul>
      </section>
      <br />

      <section className="space-y-[var(--space-4)]" aria-labelledby="contact-heading">
        <h2
          id="contact-heading"
          className="text-2xl font-semibold text-[color:var(--color-text)]"
        >
          Contact
        </h2>
        <p className="text-[color:var(--color-text-muted)]">
          For product bugs, open a GitHub Issue. For security issues, please use
          GitHub&apos;s private security advisories.
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
  );
}
