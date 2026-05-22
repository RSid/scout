"use client";

import { useEffect, useState } from "react";

import * as Dialog from "@radix-ui/react-dialog";

import ProfileCategoryFields from "@/components/ProfileCategoryFields";

import { useAnnounce } from "@/components/a11y/AnnounceProvider";
import { ONBOARDING_KEY, markOnboardingComplete } from "@/lib/onboarding-storage";
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
              Set up your accessibility profile
            </Dialog.Title>
            <p className="text-[color:var(--color-text-muted)]">
              Tell Scout which accessibility features matter to your route.
            </p>
          </header>
          <div
            id="scout-onboarding-description"
            className="mt-[var(--space-5)] space-y-[var(--space-5)]"
          >
            <p className="text-[color:var(--color-text)]">
              Scout shows public accessibility data alongside walking routes in
              Washington, DC. It&apos;s a planning aid, not a real-time safety guide.
            </p>
            <p className="text-[color:var(--color-text)]">
              Scout uses shape and color together for every feature on the map, so color
              isn&apos;t the only signal.
            </p>
            <aside className="rounded-tokenMd bg-[color:var(--color-warning-surface)] p-[var(--space-5)] text-sm text-[color:var(--color-warning-text)]">
              Scout&apos;s data comes from public datasets and can be out of date the
              day it&apos;s released. Elevators, closures, and street changes may not
              show up until the source is updated.
            </aside>
          </div>
          <section className="mt-[var(--space-6)] space-y-[var(--space-3)]">
            <h2 className="text-lg font-semibold text-[color:var(--color-text)]">
              Choose what to highlight
            </h2>
            <div className="max-h-[40vh] overflow-y-auto rounded-tokenMd border border-border p-[var(--space-4)]">
              <ProfileCategoryFields
                categories={categories}
                selections={selections}
                onToggle={toggle}
              />
            </div>
            <button
              type="button"
              className="text-sm underline text-[color:var(--color-link)]"
              onClick={() => {
                resetToDefaults();
                persist();
                announce("Categories reset to defaults.");
              }}
            >
              Reset to defaults
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
                  announce("Saved your preferences.");
                }}
              >
                Save and continue
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
