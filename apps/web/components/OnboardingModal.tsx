"use client";

import { useEffect, useState } from "react";

import * as Dialog from "@radix-ui/react-dialog";

import ProfileCategoryFields from "@/components/ProfileCategoryFields";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";
import {
  ONBOARDING_KEY,
  markOnboardingComplete,
} from "@/lib/onboarding-storage";
import { useProfile } from "@/lib/profile";

export default function OnboardingModal() {
  const announce = useAnnounce();
  const { categories, selections, toggle, persist, resetToDefaults } = useProfile();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const done = window.localStorage.getItem(ONBOARDING_KEY) === "true";
    setOpen(!done);

    window.addEventListener("storage", sync);
    function sync(ev: StorageEvent) {
      if (ev.key === ONBOARDING_KEY && ev.newValue === "true") {
        setOpen(false);
      }
    }
    return () => window.removeEventListener("storage", sync);
  }, []);

  return (
    <Dialog.Root
      modal
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-[rgba(34,28,20,0.55)] dark:bg-[rgba(10,12,22,0.7)]" />
        <Dialog.Content
          className="fixed left-[50%] top-[50%] z-[var(--z-modal)] w-[calc(100%-2rem)] max-w-xl translate-x-[-50%] translate-y-[-50%] rounded-tokenLg bg-[color:var(--color-surface-elevated)] p-[var(--space-6)] shadow-modal outline-none"
          aria-labelledby="scout-onboarding-heading"
          aria-describedby="scout-onboarding-description"
        >
          <header className="space-y-[var(--space-3)]">
            <Dialog.Title
              id="scout-onboarding-heading"
              className="text-2xl font-semibold text-[color:var(--color-text)]"
            >
              Meet Scout previews
            </Dialog.Title>
            <p className="text-[color:var(--color-text-muted)]">
              Three quick beats before plotting a District route.
            </p>
          </header>
          <div id="scout-onboarding-description" className="mt-[var(--space-5)] space-y-[var(--space-5)]">
            <p className="text-[color:var(--color-text)]">
              Scout overlays volunteered accessibility cues on top of public basemaps — good for scouting
              a trip ahead of time, terrible as a realtime safety net.
            </p>
            <p className="text-[color:var(--color-text)]">
              We pair shape + color cues with categories you pick below so color alone never carries the signal.
            </p>
            <aside className="rounded-tokenMd bg-[color:var(--color-warning-surface)] p-[var(--space-5)] text-sm text-[color:var(--color-warning-text)]">
              Data can be stale immediately after release. Crossing guards, elevators, closures, police barricades
              aren&apos;t magically reflected unless someone reports them. Always corroborate in the wild.
            </aside>
          </div>
          <section className="mt-[var(--space-6)] space-y-[var(--space-3)]">
            <h2 className="text-lg font-semibold text-[color:var(--color-text)]">Choose categories before we continue</h2>
            <div className="max-h-[40vh] overflow-y-auto rounded-tokenMd border border-border p-[var(--space-4)]">
              <ProfileCategoryFields categories={categories} selections={selections} onToggle={toggle} />
            </div>
            <button
              type="button"
              className="text-sm underline text-[color:var(--color-link)]"
              onClick={() => {
                resetToDefaults();
                persist();
                announce("Category toggles snapped back to Scout defaults.");
              }}
            >
              Reset to defaults inline
            </button>
          </section>
          <div className="mt-[var(--space-8)] flex flex-wrap gap-[var(--space-4)] justify-end">
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex min-h-tap items-center rounded-tokenMd px-[var(--space-6)] py-[var(--space-4)] font-semibold text-[color:var(--color-text-muted)] focus-visible:btn-accent-double-ring-dark"
                onClick={() => markOnboardingComplete()}
              >
                Not now
              </button>
            </Dialog.Close>
            <Dialog.Close asChild>
              <button
                type="button"
                className="inline-flex min-h-tap items-center rounded-tokenMd bg-accent px-[var(--space-8)] py-[var(--space-4)] font-semibold text-[color:var(--color-on-accent)] focus-visible:btn-accent-double-ring-dark"
                onClick={() => {
                  persist();
                  markOnboardingComplete();
                  announce("Saved preferences — welcome aboard.");
                }}
              >
                Save preference set
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
