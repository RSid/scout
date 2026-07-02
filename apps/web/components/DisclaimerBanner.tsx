"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { DISCLAIMER_L2_COPY, DISCLAIMER_L2_LINK_TEXT } from "@/lib/disclaimer-copy";
import {
  isBannerDismissedThisSession,
  markBannerDismissedThisSession,
} from "@/lib/disclaimer-banner-storage";

export default function DisclaimerBanner() {
  const pathname = usePathname();
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (isBannerDismissedThisSession()) {
      setHidden(true);
    }
  }, []);

  if (pathname === "/about" || hidden) {
    return null;
  }

  return (
    <aside
      aria-label="Scout data notice"
      className="border-b border-border bg-[color:var(--color-warning-surface)] px-6 py-3 text-[color:var(--color-warning-text)]"
    >
      <div className="mx-auto flex max-w-[var(--measure-body)] flex-wrap items-center gap-[var(--space-3)]">
        <p className="flex-1 text-[color:var(--color-warning-text)]">
          {DISCLAIMER_L2_COPY}{" "}
          <Link
            href="/about#disclaimer"
            className="font-semibold text-[color:var(--color-link)] underline underline-offset-4 hover:text-accent"
          >
            {DISCLAIMER_L2_LINK_TEXT}
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => {
            markBannerDismissedThisSession();
            setHidden(true);
          }}
          aria-label="Hide this notice"
          className="inline-flex min-h-tap min-w-tap items-center justify-center rounded-tokenSm border border-border px-[var(--space-3)] text-[color:var(--color-warning-text)] focus-visible:btn-accent-double-ring-dark"
        >
          ×
        </button>
      </div>
    </aside>
  );
}
