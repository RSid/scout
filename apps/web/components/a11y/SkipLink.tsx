"use client";

import Link from "next/link";

type Props = Readonly<{
  href?: string;
  label?: string;
  /** `fixed-corner`: global skip landmark. `flow`: skips within a subsection (map → list). */
  preset?: "fixed-corner" | "flow";
}>;

export default function SkipLink({
  href = "#main",
  label = "Skip to main content",
  preset = "fixed-corner",
}: Props) {
  const shellClasses =
    preset === "fixed-corner"
      ? "pointer-events-none fixed left-[var(--space-3)] top-[var(--space-3)] z-50 isolate"
      : "pointer-events-none relative z-[30] isolate mb-[var(--space-2)] min-h-[1px]";

  // Native browser fragment-focus does not fire reliably through next/link: depending
  // on DOM order and Next's scroll-restore, focus may stay on the link after click.
  // Own the focus side-effect here so the skip link works regardless of layout.
  const handleClick = () => {
    if (!href.startsWith("#")) return;
    const targetId = href.slice(1);
    queueMicrotask(() => {
      globalThis.document?.getElementById(targetId)?.focus();
    });
  };

  return (
    <div className={shellClasses}>
      <Link
        href={href}
        tabIndex={0}
        onClick={handleClick}
        className="pointer-events-auto inline-flex min-h-tap translate-y-[-300%] rounded-tokenMd bg-accent px-4 py-3 text-[var(--color-on-accent)] opacity-0 transition focus:translate-y-0 focus:opacity-100 focus-visible:btn-accent-double-ring-dark"
      >
        {label}
      </Link>
    </div>
  );
}
