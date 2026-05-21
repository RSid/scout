import Link from "next/link";

export default function DisclaimerBanner() {
  return (
    <aside
      aria-label="Crowdsourced accessibility disclaimer"
      className="border-b border-border bg-[color:var(--color-warning-surface)] px-6 py-3 text-[color:var(--color-warning-text)]"
    >
      <p className="max-w-[var(--measure-body)] text-[color:var(--color-warning-text)]">
        Routes and features are previews built from volunteered data. Scout does not
        guarantee real-world conditions.&nbsp;
        <Link
          href="/about"
          className="font-semibold text-[color:var(--color-link)] underline underline-offset-4 hover:text-accent"
        >
          Read the crowdsourcing disclaimer before planning a trip
        </Link>
        .
      </p>
    </aside>
  );
}
