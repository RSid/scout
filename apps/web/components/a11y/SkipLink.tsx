"use client";

import Link from "next/link";

export default function SkipLink() {
  return (
    <div className="pointer-events-none fixed left-[var(--space-3)] top-[var(--space-3)] z-50 isolate">
      <Link
        href="#main"
        tabIndex={0}
        className="pointer-events-auto inline-flex min-h-tap translate-y-[-300%] rounded-tokenMd bg-accent px-4 py-3 text-[var(--color-on-accent)] opacity-0 transition focus:translate-y-0 focus:opacity-100 focus-visible:btn-accent-double-ring-dark"
      >
        Skip to main content
      </Link>
    </div>
  );
}
